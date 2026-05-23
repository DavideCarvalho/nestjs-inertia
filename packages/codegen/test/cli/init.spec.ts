import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpBase: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpBase = await mkdtemp(join(tmpdir(), 'init-cli-spec-'));
  // Always create a minimal package.json so patchPackageJsonScripts works
  await writeFile(
    join(tmpBase, 'package.json'),
    JSON.stringify({ name: 'test-app', scripts: {} }),
    'utf8',
  );
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  await rm(tmpBase, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper to run init after clearing the module cache (needed because init.ts
// is a stateful module in forks pool — each test gets its own fork, but
// within the same file we dynamically import so we can reset the module).
// ---------------------------------------------------------------------------
async function runInitInTmpDir(framework?: 'react' | 'vue' | 'svelte', overrideCwd?: string) {
  const dir = overrideCwd ?? tmpBase;

  // Encode desired framework in package.json deps so detection works
  if (framework) {
    let pkg: Record<string, unknown> = {};
    try {
      pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    } catch {
      pkg = { name: 'test-app', scripts: {} };
    }
    const depMap: Record<string, string> = {
      react: 'react',
      vue: 'vue',
      svelte: 'svelte',
    };
    pkg.dependencies = { [depMap[framework]]: '^1.0.0' };
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkg), 'utf8');
  }

  const mod = await import('../../src/cli/init.js');
  // skipInstall avoids execSync calls during tests
  await mod.runInit({ cwd: dir, skipInstall: true });
}

// ---------------------------------------------------------------------------
// Legacy tests (keep passing)
// ---------------------------------------------------------------------------

describe('runInit — legacy behaviour', () => {
  it('creates nestjs-inertia.config.ts with defineConfig call', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(content).toContain('defineConfig');
  });

  it('creates nestjs-inertia.d.ts with module augmentation snippet', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.d.ts'), 'utf8');
    expect(content).toContain('declare module');
    expect(content).toContain('InertiaPages');
  });

  it('nestjs-inertia.d.ts includes routes: RouteParamsMap augmentation', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.d.ts'), 'utf8');
    expect(content).toContain('RouteParamsMap');
    expect(content).toMatch(/routes\s*:\s*import\([^)]+\)\.RouteParamsMap/);
  });

  it('patches .gitignore (creates if missing) with .nestjs-inertia/', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    expect(content).toContain('.nestjs-inertia/');
  });

  it('appends to existing .gitignore without duplicating the entry', async () => {
    await writeFile(join(tmpBase, '.gitignore'), 'node_modules/\ndist/\n', 'utf8');
    await runInitInTmpDir('react');

    const content = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('.nestjs-inertia/');

    // Run again — line should not be duplicated
    await runInitInTmpDir('react');
    const after = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    const occurrences = (after.match(/\.nestjs-inertia\//g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('is idempotent: does not overwrite an existing config file', async () => {
    const sentinel = '// SENTINEL DO NOT OVERWRITE\n';
    await writeFile(join(tmpBase, 'nestjs-inertia.config.ts'), sentinel, 'utf8');
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(content).toBe(sentinel);
  });

  it('is idempotent: does not overwrite an existing nestjs-inertia.d.ts', async () => {
    const sentinel = '// SENTINEL D.TS\n';
    await writeFile(join(tmpBase, 'nestjs-inertia.d.ts'), sentinel, 'utf8');
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.d.ts'), 'utf8');
    expect(content).toBe(sentinel);
  });
});

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

describe('detectFramework', () => {
  it('returns react when react is in dependencies', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { react: '^18.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('react');
  });

  it('returns vue when vue is in dependencies', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { vue: '^3.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('vue');
  });

  it('returns svelte when svelte is in dependencies', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { svelte: '^4.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('svelte');
  });

  it('returns null when no framework found', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { dependencies: {} };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBeNull();
  });

  it('detects @inertiajs/react over bare react', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { '@inertiajs/react': '^1.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('react');
  });
});

// ---------------------------------------------------------------------------
// React scaffolding
// ---------------------------------------------------------------------------

describe('runInit with React', () => {
  it('creates inertia/app.tsx with createInertiaApp', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'inertia', 'app.tsx'), 'utf8');
    expect(content).toContain('createInertiaApp');
    expect(content).toContain("'@inertiajs/react'");
    expect(content).toContain('createRoot');
  });

  it('creates inertia/pages/Home.tsx', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'inertia', 'pages', 'Home.tsx'), 'utf8');
    expect(content).toContain('greeting');
    expect(content).toContain('Home.tsx');
  });

  it('creates inertia/index.html with {{page}} placeholder', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'inertia', 'index.html'), 'utf8');
    expect(content).toContain('{{page}}');
    expect(content).toContain('app.tsx');
  });

  it('creates vite.config.ts referencing react: true', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'vite.config.ts'), 'utf8');
    expect(content).toContain('react: true');
    expect(content).toContain('@dudousxd/nestjs-inertia-vite/plugin');
  });

  it('config glob uses *.tsx for react', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(content).toContain('inertia/pages/**/*.tsx');
  });

  it('creates src/home.controller.ts', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'src', 'home.controller.ts'), 'utf8');
    expect(content).toContain('@Controller');
    expect(content).toContain("@Inertia('Home')");
    expect(content).toContain('greeting');
  });
});

// ---------------------------------------------------------------------------
// Vue scaffolding
// ---------------------------------------------------------------------------

describe('runInit with Vue', () => {
  it('creates inertia/app.ts with Vue createInertiaApp', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'inertia', 'app.ts'), 'utf8');
    expect(content).toContain("'@inertiajs/vue3'");
    expect(content).toContain('createApp');
  });

  it('creates inertia/pages/Home.vue', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'inertia', 'pages', 'Home.vue'), 'utf8');
    expect(content).toContain('greeting');
    expect(content).toContain('Home.vue');
  });

  it('creates vite.config.ts referencing vue: true', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'vite.config.ts'), 'utf8');
    expect(content).toContain('vue: true');
  });

  it('config glob uses *.vue for vue', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(content).toContain('inertia/pages/**/*.vue');
  });

  it('creates inertia/index.html with app.ts script src', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'inertia', 'index.html'), 'utf8');
    expect(content).toContain('app.ts');
  });
});

// ---------------------------------------------------------------------------
// Svelte scaffolding
// ---------------------------------------------------------------------------

describe('runInit with Svelte', () => {
  it('creates inertia/app.ts with Svelte createInertiaApp', async () => {
    await runInitInTmpDir('svelte');
    const content = await readFile(join(tmpBase, 'inertia', 'app.ts'), 'utf8');
    expect(content).toContain("'@inertiajs/svelte'");
    expect(content).toContain('mount');
  });

  it('creates inertia/pages/Home.svelte', async () => {
    await runInitInTmpDir('svelte');
    const content = await readFile(join(tmpBase, 'inertia', 'pages', 'Home.svelte'), 'utf8');
    expect(content).toContain('greeting');
    expect(content).toContain('Home.svelte');
  });

  it('creates vite.config.ts referencing svelte: true', async () => {
    await runInitInTmpDir('svelte');
    const content = await readFile(join(tmpBase, 'vite.config.ts'), 'utf8');
    expect(content).toContain('svelte: true');
  });

  it('config glob uses *.svelte for svelte', async () => {
    await runInitInTmpDir('svelte');
    const content = await readFile(join(tmpBase, 'nestjs-inertia.config.ts'), 'utf8');
    expect(content).toContain('inertia/pages/**/*.svelte');
  });
});

// ---------------------------------------------------------------------------
// Idempotency (full run)
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('second run skips all files that already exist', async () => {
    await runInitInTmpDir('react');
    // All files are created on first run; second run should skip them all
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });
    await runInitInTmpDir('react');
    spy.mockRestore();

    const skipLogs = logs.filter((l) => l.includes('already exists, skipping'));
    // Expect at least the main scaffold files to be skipped
    expect(skipLogs.length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Build scripts
// ---------------------------------------------------------------------------

describe('patchPackageJsonScripts', () => {
  it('adds build:client and build:ssr scripts to package.json', async () => {
    await runInitInTmpDir('react');
    const pkg = JSON.parse(await readFile(join(tmpBase, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:client']).toBe('vite build');
    expect(pkg.scripts['build:ssr']).toBe('VITE_SSR=1 vite build --ssr');
  });

  it('does not overwrite existing scripts', async () => {
    const pkg = { name: 'test', scripts: { 'build:client': 'custom-build' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    const { patchPackageJsonScripts } = await import('../../src/cli/init.js');
    await patchPackageJsonScripts(tmpBase, { 'build:client': 'vite build' });
    const updated = JSON.parse(await readFile(join(tmpBase, 'package.json'), 'utf8'));
    expect(updated.scripts['build:client']).toBe('custom-build');
  });
});

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', async () => {
    await writeFile(join(tmpBase, 'pnpm-lock.yaml'), '', 'utf8');
    const { detectPackageManager } = await import('../../src/cli/init.js');
    expect(await detectPackageManager(tmpBase)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    await writeFile(join(tmpBase, 'yarn.lock'), '', 'utf8');
    const { detectPackageManager } = await import('../../src/cli/init.js');
    expect(await detectPackageManager(tmpBase)).toBe('yarn');
  });

  it('defaults to npm when no lockfile found', async () => {
    const { detectPackageManager } = await import('../../src/cli/init.js');
    expect(await detectPackageManager(tmpBase)).toBe('npm');
  });
});

// ---------------------------------------------------------------------------
// writeIfNotExists
// ---------------------------------------------------------------------------

describe('writeIfNotExists', () => {
  it('creates file when it does not exist', async () => {
    const { writeIfNotExists } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'new-file.txt');
    await writeIfNotExists(filePath, 'hello', 'new-file.txt');
    const content = await readFile(filePath, 'utf8');
    expect(content).toBe('hello');
  });

  it('skips file when it already exists', async () => {
    const { writeIfNotExists } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'existing.txt');
    await writeFile(filePath, 'original', 'utf8');
    await writeIfNotExists(filePath, 'new content', 'existing.txt');
    const content = await readFile(filePath, 'utf8');
    expect(content).toBe('original');
  });

  it('creates parent directories when they do not exist', async () => {
    const { writeIfNotExists } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'deep', 'nested', 'file.txt');
    await writeIfNotExists(filePath, 'content', 'deep/nested/file.txt');
    const content = await readFile(filePath, 'utf8');
    expect(content).toBe('content');
  });
});
