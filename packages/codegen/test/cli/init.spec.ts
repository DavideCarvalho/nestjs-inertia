import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpBase: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpBase = await mkdtemp(join(tmpdir(), 'init-cli-spec-'));
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpBase, { recursive: true, force: true });
});

describe('runInit', () => {
  it('creates nestjs-inertia.config.ts with defineConfig call', async () => {
    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const configContent = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(configContent).toContain('defineConfig');
    expect(configContent).toContain('inertia/pages/**/*.{tsx,vue,svelte}');
  });

  it('creates nestjs-inertia.d.ts with module augmentation snippet', async () => {
    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const dtsContent = await readFile(join(tmpBase, 'nestjs-inertia.d.ts'), 'utf8');
    expect(dtsContent).toContain('declare module');
    expect(dtsContent).toContain('InertiaPages');
  });

  it('patches .gitignore (creates if missing) with .nestjs-inertia/', async () => {
    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const gitignoreContent = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    expect(gitignoreContent).toContain('.nestjs-inertia/');
  });

  it('appends to existing .gitignore without duplicating the entry', async () => {
    await writeFile(join(tmpBase, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');

    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const gitignoreContent = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    expect(gitignoreContent).toContain('node_modules/');
    expect(gitignoreContent).toContain('dist/');
    expect(gitignoreContent).toContain('.nestjs-inertia/');

    // Run again — line should not be duplicated
    await runInit({ cwd: tmpBase });
    const after = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    const occurrences = (after.match(/\.nestjs-inertia\//g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('is idempotent: does not overwrite an existing config file', async () => {
    // Write sentinel to the config file before init
    const sentinel = '// SENTINEL DO NOT OVERWRITE\n';
    await writeFile(join(tmpBase, 'nestjs-inertia.config.ts'), sentinel, 'utf8');

    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const configContent = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(configContent).toBe(sentinel);
  });

  it('is idempotent: does not overwrite an existing nestjs-inertia.d.ts', async () => {
    const sentinel = '// SENTINEL D.TS\n';
    await writeFile(join(tmpBase, 'nestjs-inertia.d.ts'), sentinel, 'utf8');

    const { runInit } = await import('../../src/cli/init.js');
    await runInit({ cwd: tmpBase });

    const dtsContent = await readFile(join(tmpBase, 'nestjs-inertia.d.ts'), 'utf8');
    expect(dtsContent).toBe(sentinel);
  });
});
