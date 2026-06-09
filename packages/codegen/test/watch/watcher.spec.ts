import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/config/types.js';
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

function makeConfig(pagesDir: string, outDir: string, contractsGlob?: string): ResolvedConfig {
  return {
    pages: {
      glob: '**/*.tsx',
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
    },
    contracts: {
      glob: contractsGlob ?? 'src/**/*.controller.ts',
      debounceMs: 500,
    },
    scopes: {},
    codegen: { outDir, cwd: pagesDir },
    app: null,
    fetcher: null,
    forms: { enabled: true, watch: 'src/**/*.dto.ts', zodImport: 'zod' },
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

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto-watch skipped'));
    warnSpy.mockRestore();
  });

  it('initial pass generates routes.ts + api.ts from DTO controllers (not pages-only)', async () => {
    const fixturesDir = resolve(__dirname, '../__fixtures__/app');
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-initial-spec-'));
    const pagesDir = join(tmpBase, 'pages');
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(pagesDir, { recursive: true });

    // Seed a page so pages discovery works
    await writeFile(
      join(pagesDir, 'Home.tsx'),
      'export default function Home() { return null; }\n',
      'utf8',
    );

    // Point at specific non-colliding fixtures (collision.controller.ts is a deliberate error fixture)
    const config = makeConfig(pagesDir, outDir, 'dto-controller.controller.ts');
    config.codegen = { outDir, cwd: fixturesDir };

    const watcher = await watch(config);
    watchers.push(watcher);

    // Wait for routes.ts to appear (initial discovery + emit)
    await waitForCondition(async () => {
      try {
        await readFile(join(outDir, 'routes.ts'), 'utf8');
        return true;
      } catch {
        return false;
      }
    }, 5000);

    const routesContent = await readFile(join(outDir, 'routes.ts'), 'utf8');
    expect(routesContent).toContain('ROUTES');
    expect(routesContent).toContain('RouteName');
  });

  it('uses static discovery (discoverContractsFast) and regenerates routes.ts on controller change', async () => {
    const fixturesDir = resolve(__dirname, '../__fixtures__/app');
    tmpBase = await mkdtemp(join(tmpdir(), 'watcher-static-spec-'));
    const outDir = join(tmpBase, '.nestjs-inertia');
    await mkdir(outDir, { recursive: true });

    // The fixture dir has contract-users.controller.ts, which the fast path should discover
    const config = makeConfig(fixturesDir, outDir, 'contract-users.controller.ts');
    config.codegen = { outDir, cwd: fixturesDir };

    let onChangeCalled = 0;
    const watcher = await watch(config, () => {
      onChangeCalled++;
    });
    watchers.push(watcher);

    // Give chokidar time to set up
    await new Promise((r) => setTimeout(r, 300));

    // Touch the fixture controller to trigger the contracts watcher
    const controllerPath = join(fixturesDir, 'contract-users.controller.ts');
    const originalContent = await readFile(controllerPath, 'utf8');
    await writeFile(controllerPath, `${originalContent}\n// touched\n`, 'utf8');

    try {
      // Wait for onChange to fire
      await waitForCondition(() => onChangeCalled > 0, 4000);

      // The api.ts should reference the auto-derived contract name (ContractUsersController.list → contractUsers.list)
      const apiContent = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(apiContent).toContain('contractUsers');
    } finally {
      // Restore original fixture content
      await writeFile(controllerPath, originalContent, 'utf8');
    }
  });
});
