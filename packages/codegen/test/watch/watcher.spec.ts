import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ResolvedConfig } from '../../src/config/types.js';
import { watch } from '../../src/watch/watcher.js';

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

function makeConfig(pagesDir: string, outDir: string): ResolvedConfig {
  return {
    pages: {
      glob: '**/*.tsx',
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
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
});
