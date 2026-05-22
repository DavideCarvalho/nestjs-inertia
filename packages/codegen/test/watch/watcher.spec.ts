import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/config/types.js';
import type { RouteDescriptor } from '../../src/discovery/routes.js';
import { watch } from '../../src/watch/watcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper: poll until predicate returns true or timeout expires
async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4000,
  intervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function makeConfig(pagesDir: string, outDir: string, contractsGlob?: string, useStaticDiscovery?: boolean): ResolvedConfig {
  return {
    pages: {
      glob: '**/*.tsx',
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
    },
    contracts: {
      glob: contractsGlob ?? 'src/**/*.controller.ts',
      debounceMs: 500,
      useStaticDiscovery: useStaticDiscovery ?? false,
    },
    scopes: {},
    codegen: { outDir, cwd: pagesDir },
    app: null,
  };
}

describe('watch', () => {
  let tmpBase: string;
  const watchers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    for (const w of watchers) {
      await w.close();
    }
    watchers.length = 0;
    if (tmpBase) {
      await rm(tmpBase, { recursive: true, force: true });
    }
  });

  it('calls onChange and updates pages.d.ts when a new file is written', async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-spec-'));
    const pagesDir = join(tmpBase, 'pages');
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(pagesDir, { recursive: true });

    // Seed a fixture page so watcher has something to start with
    await writeFile(
      join(pagesDir, 'Home.tsx'),
      'export type ComponentProps = { title: string };\nexport default function Home() { return null; }\n',
      'utf8',
    );

    const config = makeConfig(pagesDir, outDir);
    let onChangeCalled = 0;
    const watcher = await watch(config, () => {
      onChangeCalled++;
    });
    watchers.push(watcher);

    // Give chokidar time to set up its internal watch
    await new Promise((r) => setTimeout(r, 300));

    // Write a new page
    await writeFile(
      join(pagesDir, 'About.tsx'),
      'export type ComponentProps = { subtitle: string };\nexport default function About() { return null; }\n',
      'utf8',
    );

    // Wait for onChange to fire
    await waitForCondition(() => onChangeCalled > 0, 4000);

    // Assert the output file was updated
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('About');
    expect(content).toContain('Home');
  });

  it('returns a no-op watcher and logs a warning when outDir is already locked', async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-lock-spec-'));
    const pagesDir = join(tmpBase, 'pages');
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      join(pagesDir, 'Index.tsx'),
      'export default function Index() { return null; }\n',
      'utf8',
    );

    const config = makeConfig(pagesDir, outDir);

    // Stub console.warn so we can assert it fires
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const watcher1 = await watch(config);
    watchers.push(watcher1);

    // Give first watcher a moment to write the lock file
    await new Promise((r) => setTimeout(r, 200));

    const watcher2 = await watch(config);
    watchers.push(watcher2);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already watching'));
    warnSpy.mockRestore();
  });

  it('re-emits routes.ts and calls onChange when a controller file changes', async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-contracts-spec-'));
    const projectDir = join(tmpBase, 'project');
    const srcDir = join(projectDir, 'src');
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(srcDir, { recursive: true });

    // Seed a page file
    await writeFile(
      join(projectDir, 'Home.tsx'),
      'export type ComponentProps = { title: string };\nexport default function Home() { return null; }\n',
      'utf8',
    );

    // Seed a controller file that will be watched
    const controllerPath = join(srcDir, 'app.controller.ts');
    await writeFile(
      controllerPath,
      '// initial controller\n',
      'utf8',
    );

    // Stub discoverRoutes to avoid spawning Nest — returns a deterministic route table
    const stubRoutes: RouteDescriptor[] = [
      { method: 'GET', path: '/stub', name: 'StubController.index', params: [] },
    ];
    let discoverCallCount = 0;
    const stubDiscoverRoutes = async () => {
      discoverCallCount++;
      return stubRoutes;
    };

    const config = makeConfig(projectDir, outDir, 'src/**/*.controller.ts');
    let onChangeCalled = 0;
    const watcher = await watch(config, () => { onChangeCalled++; }, stubDiscoverRoutes);
    watchers.push(watcher);

    // Give chokidar time to set up its internal watch
    await new Promise((r) => setTimeout(r, 300));

    const initialDiscoverCount = discoverCallCount;

    // Modify the controller file to trigger the contracts watcher
    await writeFile(
      controllerPath,
      '// initial controller\n// modified\n',
      'utf8',
    );

    // Wait for onChange to fire (500ms debounce + processing time, 3s timeout)
    await waitForCondition(() => onChangeCalled > 0, 3000);

    // discoverRoutes should have been called at least once after the change
    expect(discoverCallCount).toBeGreaterThan(initialDiscoverCount);

    // routes.ts should have been regenerated with stub route
    const routesContent = await readFile(join(outDir, 'routes.ts'), 'utf8');
    expect(routesContent).toContain('StubController.index');
  });

  it('uses static discovery (discoverContractsFast) when useStaticDiscovery is true', async () => {
    const fixturesDir = resolve(__dirname, '../__fixtures__/app');
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-static-spec-'));
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(outDir, { recursive: true });

    // The fixture dir has contract-users.controller.ts, which the fast path should discover
    const config = makeConfig(fixturesDir, outDir, 'contract-users.controller.ts', true);
    config.codegen = { outDir, cwd: fixturesDir };

    let onChangeCalled = 0;
    // Do NOT pass a discoverRoutesImpl stub — the watcher should use static discovery instead
    const watcher = await watch(config, () => { onChangeCalled++; });
    watchers.push(watcher);

    // Give chokidar time to set up
    await new Promise((r) => setTimeout(r, 300));

    // Touch the fixture controller to trigger the contracts watcher
    const controllerPath = join(fixturesDir, 'contract-users.controller.ts');
    const originalContent = await readFile(controllerPath, 'utf8');
    await writeFile(controllerPath, originalContent + '\n// touched\n', 'utf8');

    try {
      // Wait for onChange to fire
      await waitForCondition(() => onChangeCalled > 0, 4000);

      // The api.ts should reference the users.list contract name (from contract options)
      const apiContent = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(apiContent).toContain('users.list');
    } finally {
      // Restore original fixture content
      await writeFile(controllerPath, originalContent, 'utf8');
    }
  });
});
