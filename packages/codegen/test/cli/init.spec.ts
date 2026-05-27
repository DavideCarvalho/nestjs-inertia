import { mkdirSync, writeFileSync } from 'node:fs';
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
  it('creates inertia/app/client.tsx with createInertiaApp', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'inertia', 'app', 'client.tsx'), 'utf8');
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

  it('creates inertia/index.html with @inertia directives', async () => {
    await runInitInTmpDir('react');
    const content = await readFile(join(tmpBase, 'inertia', 'index.html'), 'utf8');
    expect(content).toContain('@inertia');
    expect(content).toContain('@inertiaHead');
    expect(content).toContain("@vite('app/client.tsx')");
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
  it('creates inertia/app/client.ts with Vue createInertiaApp', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'inertia', 'app', 'client.ts'), 'utf8');
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

  it('creates inertia/index.html with app/client.ts script src', async () => {
    await runInitInTmpDir('vue');
    const content = await readFile(join(tmpBase, 'inertia', 'index.html'), 'utf8');
    expect(content).toContain('app/client.ts');
  });
});

// ---------------------------------------------------------------------------
// Svelte scaffolding
// ---------------------------------------------------------------------------

describe('runInit with Svelte', () => {
  it('creates inertia/app/client.ts with Svelte createInertiaApp', async () => {
    await runInitInTmpDir('svelte');
    const content = await readFile(join(tmpBase, 'inertia', 'app', 'client.ts'), 'utf8');
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

    const skipLogs = logs.filter((l) => l.includes('already exists, skipped'));
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
// Template engine detection
// ---------------------------------------------------------------------------

describe('detectTemplateEngine', () => {
  it('detects handlebars from dependencies', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { handlebars: '^4.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('handlebars');
  });

  it('detects ejs from dependencies', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { ejs: '^3.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('ejs');
  });

  it('detects pug from dependencies', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { pug: '^3.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('pug');
  });

  it('detects liquid from liquidjs dependency', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { dependencies: { liquidjs: '^10.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('liquid');
  });

  it('defaults to html when no template engine found', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { dependencies: {} };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('html');
  });

  it('detects engine from devDependencies', async () => {
    const { detectTemplateEngine } = await import('../../src/cli/init.js');
    const pkg = { devDependencies: { ejs: '^3.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectTemplateEngine(tmpBase)).toBe('ejs');
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

// ---------------------------------------------------------------------------
// patchAppModule
// ---------------------------------------------------------------------------

const MINIMAL_APP_MODULE = `import { Module } from '@nestjs/common';
@Module({ imports: [], controllers: [] })
export class AppModule {}
`;

const MINIMAL_MAIN_TS = `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
`;

describe('patchAppModule', () => {
  it('adds InertiaModule import and forRoot call', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'app.module.ts');
    writeFileSync(filePath, MINIMAL_APP_MODULE, 'utf8');

    const result = patchAppModule(filePath, 'inertia/index.html');
    expect(result).toBe('patched');

    const content = await readFile(filePath, 'utf8');
    expect(content).toContain("import { InertiaModule } from '@dudousxd/nestjs-inertia'");
    expect(content).toContain("import { resolve } from 'node:path'");
    expect(content).toContain('InertiaModule.forRoot(');
    expect(content).toContain("resolve(__dirname, '../inertia/index.html')");
  });

  it('adds HomeController import and registration', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'app.module.ts');
    writeFileSync(filePath, MINIMAL_APP_MODULE, 'utf8');

    patchAppModule(filePath, 'inertia/index.html');

    const content = await readFile(filePath, 'utf8');
    expect(content).toContain("import { HomeController } from './home.controller'");
    expect(content).toContain('HomeController,');
  });

  it('returns already when both InertiaModule and HomeController already present', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'app.module.ts');
    const alreadyPatched = `import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { HomeController } from './home.controller';
${MINIMAL_APP_MODULE}`;
    writeFileSync(filePath, alreadyPatched, 'utf8');

    const result = patchAppModule(filePath, 'inertia/index.html');
    expect(result).toBe('already');
  });

  it('returns skipped when file does not exist', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const result = patchAppModule(join(tmpBase, 'nonexistent.ts'), 'inertia/index.html');
    expect(result).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// patchMainTs
// ---------------------------------------------------------------------------

describe('patchMainTs', () => {
  it('adds setupInertiaVite import and call', async () => {
    const { patchMainTs } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'main.ts');
    writeFileSync(filePath, MINIMAL_MAIN_TS, 'utf8');

    const result = patchMainTs(filePath);
    expect(result).toBe('patched');

    const content = await readFile(filePath, 'utf8');
    expect(content).toContain("import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite'");
    expect(content).toContain('setupInertiaVite(');
  });

  it('returns already when setupInertiaVite already present', async () => {
    const { patchMainTs } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'main.ts');
    writeFileSync(
      filePath,
      `import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';\n${MINIMAL_MAIN_TS}`,
      'utf8',
    );

    const result = patchMainTs(filePath);
    expect(result).toBe('already');
  });

  it('returns skipped when file does not exist', async () => {
    const { patchMainTs } = await import('../../src/cli/init.js');
    const result = patchMainTs(join(tmpBase, 'nonexistent.ts'));
    expect(result).toBe('skipped');
  });

  it('places vite setup call after NestFactory.create line', async () => {
    const { patchMainTs } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'main.ts');
    writeFileSync(filePath, MINIMAL_MAIN_TS, 'utf8');

    patchMainTs(filePath);

    const content = await readFile(filePath, 'utf8');
    const createPos = content.indexOf('NestFactory.create');
    // The setupInertiaVite call (not the import) must appear after the create line
    const callPos = content.indexOf('await setupInertiaVite(');
    expect(callPos).toBeGreaterThan(createPos);
  });
});

// ---------------------------------------------------------------------------
// runInit auto-patching integration
// ---------------------------------------------------------------------------

describe('runInit — auto-patches app.module.ts and main.ts', () => {
  async function runWithSrcFiles(framework: 'react' | 'vue' | 'svelte' = 'react') {
    // Create src/ directory with minimal files
    mkdirSync(join(tmpBase, 'src'), { recursive: true });
    writeFileSync(join(tmpBase, 'src', 'app.module.ts'), MINIMAL_APP_MODULE, 'utf8');
    writeFileSync(join(tmpBase, 'src', 'main.ts'), MINIMAL_MAIN_TS, 'utf8');
    await runInitInTmpDir(framework);
  }

  it('patches app.module.ts with InertiaModule.forRoot', async () => {
    await runWithSrcFiles('react');
    const content = await readFile(join(tmpBase, 'src', 'app.module.ts'), 'utf8');
    expect(content).toContain('InertiaModule.forRoot(');
    expect(content).toContain("import { InertiaModule } from '@dudousxd/nestjs-inertia'");
  });

  it('patches app.module.ts with HomeController', async () => {
    await runWithSrcFiles('react');
    const content = await readFile(join(tmpBase, 'src', 'app.module.ts'), 'utf8');
    expect(content).toContain('HomeController,');
    expect(content).toContain("import { HomeController } from './home.controller'");
  });

  it('patches main.ts with setupInertiaVite', async () => {
    await runWithSrcFiles('react');
    const content = await readFile(join(tmpBase, 'src', 'main.ts'), 'utf8');
    expect(content).toContain('setupInertiaVite(');
    expect(content).toContain("import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite'");
  });

  it('is idempotent: second run does not double-patch', async () => {
    await runWithSrcFiles('react');
    const afterFirst = await readFile(join(tmpBase, 'src', 'app.module.ts'), 'utf8');

    await runInitInTmpDir('react');
    const afterSecond = await readFile(join(tmpBase, 'src', 'app.module.ts'), 'utf8');

    expect(afterSecond).toBe(afterFirst);
    const occurrences = (afterSecond.match(/InertiaModule/g) ?? []).length;
    // import + forRoot call = 2 occurrences (not doubled)
    expect(occurrences).toBeLessThanOrEqual(3);
  });

  it('gracefully skips when app.module.ts is absent', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await runInitInTmpDir('react');
    spy.mockRestore();

    const warnLog = logs.find((l) => l.includes('app.module.ts not found'));
    expect(warnLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// installDeps — branching on package manager
// ---------------------------------------------------------------------------

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(() => Buffer.from('')) };
});

describe('installDeps', () => {
  let execMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('node:child_process');
    execMock = cp.execFileSync as ReturnType<typeof vi.fn>;
    execMock.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses "install" command for npm', async () => {
    const { installDeps } = await import('../../src/cli/init.js');
    installDeps('npm', ['some-fake-pkg'], false);
    expect(execMock).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', 'some-fake-pkg']),
      expect.anything(),
    );
  });

  it('uses "add -D" command for pnpm dev deps', async () => {
    const { installDeps } = await import('../../src/cli/init.js');
    installDeps('pnpm', ['some-fake-dev-pkg'], true);
    expect(execMock).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['add', '-D', 'some-fake-dev-pkg']),
      expect.anything(),
    );
  });

  it('uses "add -D" command for yarn dev deps', async () => {
    const { installDeps } = await import('../../src/cli/init.js');
    installDeps('yarn', ['some-fake-yarn-pkg'], true);
    expect(execMock).toHaveBeenCalledWith(
      'yarn',
      expect.arrayContaining(['add', '-D', 'some-fake-yarn-pkg']),
      expect.anything(),
    );
  });

  it('does nothing when deps array is empty', async () => {
    const { installDeps } = await import('../../src/cli/init.js');
    installDeps('npm', [], false);
    expect(execMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// patchMainTs — edge case: no NestFactory.create match
// ---------------------------------------------------------------------------

describe('patchMainTs — edge cases', () => {
  it('returns skipped when main.ts has no NestFactory.create line', async () => {
    const { patchMainTs } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'main-no-create.ts');
    writeFileSync(
      filePath,
      `import { NestFactory } from '@nestjs/core';
async function bootstrap() {
  // No NestFactory.create call
  console.log('hello');
}
bootstrap();
`,
      'utf8',
    );

    const result = patchMainTs(filePath);
    expect(result).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// handleViteConfig — existing config without plugin
// ---------------------------------------------------------------------------

describe('runInit — vite config edge cases', () => {
  it('warns when vite.config.ts exists without nestInertia plugin', async () => {
    // Create a vite.config.ts without the plugin
    await writeFile(
      join(tmpBase, 'vite.config.ts'),
      `import { defineConfig } from 'vite';
export default defineConfig({ plugins: [] });
`,
      'utf8',
    );
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await runInitInTmpDir('react');
    spy.mockRestore();

    const warnLog = logs.find((l) => l.includes('nestInertia plugin not detected'));
    expect(warnLog).toBeDefined();
  });

  it('skips silently when vite.config.ts already has nestInertia plugin', async () => {
    await writeFile(
      join(tmpBase, 'vite.config.ts'),
      `import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [nestInertia({ react: true })] });
`,
      'utf8',
    );
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await runInitInTmpDir('react');
    spy.mockRestore();

    const warnLog = logs.find((l) => l.includes('nestInertia plugin not detected'));
    expect(warnLog).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// patchGitignore — existing content not ending with newline
// ---------------------------------------------------------------------------

describe('patchGitignore — edge cases', () => {
  it('appends with preceding newline when file does not end with newline', async () => {
    // Write .gitignore without trailing newline
    await writeFile(join(tmpBase, '.gitignore'), 'node_modules/', 'utf8');
    await runInitInTmpDir('react');

    const content = await readFile(join(tmpBase, '.gitignore'), 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.nestjs-inertia/');
    // Should have a newline before .nestjs-inertia/
    expect(content).toContain('node_modules/\n.nestjs-inertia/');
  });
});

// ---------------------------------------------------------------------------
// patchPackageJsonScripts — missing package.json
// ---------------------------------------------------------------------------

describe('patchPackageJsonScripts — edge cases', () => {
  it('silently returns when package.json does not exist', async () => {
    const { patchPackageJsonScripts } = await import('../../src/cli/init.js');
    const emptyDir = join(tmpBase, 'no-pkg-json');
    mkdirSync(emptyDir, { recursive: true });
    // Should not throw
    await patchPackageJsonScripts(emptyDir, { test: 'echo test' });
  });

  it('handles package.json with no scripts field', async () => {
    const { patchPackageJsonScripts } = await import('../../src/cli/init.js');
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8');
    await patchPackageJsonScripts(tmpBase, { 'build:client': 'vite build' });
    const updated = JSON.parse(await readFile(join(tmpBase, 'package.json'), 'utf8'));
    expect(updated.scripts['build:client']).toBe('vite build');
  });
});

// ---------------------------------------------------------------------------
// patchAppModule — findAfterLastImport edge cases
// ---------------------------------------------------------------------------

describe('patchAppModule — edge cases', () => {
  it('handles file that starts with import (no preceding newline)', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'app-start-import.ts');
    writeFileSync(
      filePath,
      `import { Module } from '@nestjs/common';
@Module({ imports: [], controllers: [] })
export class AppModule {}
`,
      'utf8',
    );

    const result = patchAppModule(filePath, 'inertia/index.html');
    expect(result).toBe('patched');

    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('InertiaModule');
    expect(content).toContain('HomeController');
  });

  it('handles file with no import statements at all', async () => {
    const { patchAppModule } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'app-no-imports.ts');
    writeFileSync(
      filePath,
      `@Module({ imports: [], controllers: [] })
export class AppModule {}
`,
      'utf8',
    );

    const result = patchAppModule(filePath, 'inertia/index.html');
    expect(result).toBe('patched');
  });
});

// ---------------------------------------------------------------------------
// patchNestCliJson
// ---------------------------------------------------------------------------

describe('patchNestCliJson', () => {
  it('adds asset entry for shell directory', async () => {
    const { patchNestCliJson } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'nest-cli.json');
    writeFileSync(filePath, JSON.stringify({ compilerOptions: { assets: [] } }, null, 2), 'utf8');

    const result = patchNestCliJson(tmpBase, 'inertia');
    expect(result).toBe('patched');

    const content = JSON.parse(await readFile(filePath, 'utf8'));
    const assets = content.compilerOptions.assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].include).toBe('../inertia/**/*');
    expect(assets[0].outDir).toBe('dist/inertia');
  });

  it('returns already when asset entry exists', async () => {
    const { patchNestCliJson } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'nest-cli.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        { compilerOptions: { assets: [{ include: '../inertia/**/*', outDir: 'dist/inertia' }] } },
        null,
        2,
      ),
      'utf8',
    );

    const result = patchNestCliJson(tmpBase, 'inertia');
    expect(result).toBe('already');
  });

  it('returns skipped when nest-cli.json does not exist', async () => {
    const { patchNestCliJson } = await import('../../src/cli/init.js');
    const result = patchNestCliJson(join(tmpBase, 'nonexistent-dir'), 'inertia');
    expect(result).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// patchTsconfigExclude
// ---------------------------------------------------------------------------

describe('patchTsconfigExclude', () => {
  it('adds inertia to exclude array in tsconfig.json', async () => {
    const { patchTsconfigExclude } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'tsconfig.json');
    writeFileSync(
      filePath,
      JSON.stringify({ compilerOptions: {}, exclude: ['dist'] }, null, 2),
      'utf8',
    );

    const result = patchTsconfigExclude(tmpBase, 'inertia');
    expect(result).toBe('patched');

    const content = JSON.parse(await readFile(filePath, 'utf8'));
    expect(content.exclude).toContain('inertia');
    expect(content.exclude).toContain('dist');
  });

  it('creates exclude array when missing', async () => {
    const { patchTsconfigExclude } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'tsconfig.json');
    writeFileSync(filePath, JSON.stringify({ compilerOptions: {} }, null, 2), 'utf8');

    const result = patchTsconfigExclude(tmpBase, 'inertia');
    expect(result).toBe('patched');

    const content = JSON.parse(await readFile(filePath, 'utf8'));
    expect(content.exclude).toContain('inertia');
  });

  it('returns already when inertia is already excluded', async () => {
    const { patchTsconfigExclude } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'tsconfig.json');
    writeFileSync(
      filePath,
      JSON.stringify({ compilerOptions: {}, exclude: ['inertia'] }, null, 2),
      'utf8',
    );

    const result = patchTsconfigExclude(tmpBase, 'inertia');
    expect(result).toBe('already');
  });

  it('returns skipped when file does not exist', async () => {
    const { patchTsconfigExclude } = await import('../../src/cli/init.js');
    const result = patchTsconfigExclude(join(tmpBase, 'nonexistent-dir'), 'inertia');
    expect(result).toBe('skipped');
  });

  it('patches tsconfig.build.json when filename is provided', async () => {
    const { patchTsconfigExclude } = await import('../../src/cli/init.js');
    const filePath = join(tmpBase, 'tsconfig.build.json');
    writeFileSync(
      filePath,
      JSON.stringify({ extends: './tsconfig.json', exclude: ['dist', 'test'] }, null, 2),
      'utf8',
    );

    const result = patchTsconfigExclude(tmpBase, 'inertia', 'tsconfig.build.json');
    expect(result).toBe('patched');

    const content = JSON.parse(await readFile(filePath, 'utf8'));
    expect(content.exclude).toContain('inertia');
    expect(content.exclude).toContain('dist');
    expect(content.exclude).toContain('test');
  });
});

// ---------------------------------------------------------------------------
// runInit patches both tsconfigs
// ---------------------------------------------------------------------------

describe('runInit — tsconfig patching', () => {
  it('patches both tsconfig.json and tsconfig.build.json', async () => {
    mkdirSync(join(tmpBase, 'src'), { recursive: true });
    writeFileSync(join(tmpBase, 'src', 'app.module.ts'), MINIMAL_APP_MODULE, 'utf8');
    writeFileSync(join(tmpBase, 'src', 'main.ts'), MINIMAL_MAIN_TS, 'utf8');
    writeFileSync(
      join(tmpBase, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: {} }, null, 2),
      'utf8',
    );
    writeFileSync(
      join(tmpBase, 'tsconfig.build.json'),
      JSON.stringify({ extends: './tsconfig.json', exclude: ['dist'] }, null, 2),
      'utf8',
    );

    await runInitInTmpDir('react');

    const tsconfig = JSON.parse(await readFile(join(tmpBase, 'tsconfig.json'), 'utf8'));
    const tsconfigBuild = JSON.parse(await readFile(join(tmpBase, 'tsconfig.build.json'), 'utf8'));
    expect(tsconfig.exclude).toContain('inertia');
    expect(tsconfigBuild.exclude).toContain('inertia');
  });
});

// ---------------------------------------------------------------------------
// runInit — handlebars engine shell file name
// ---------------------------------------------------------------------------

describe('runInit — template engine scaffolding', () => {
  async function runInitWithEngine(engine: string, engineDep: string) {
    // Write package.json with both react and the template engine dep
    // so that runInitInTmpDir doesn't overwrite the engine dep
    const pkg = {
      name: 'test-app',
      scripts: {},
      dependencies: { react: '^18.0.0', [engineDep]: '^1.0.0' },
    };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');

    const mod = await import('../../src/cli/init.js');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await mod.runInit({ cwd: tmpBase, skipInstall: true });
    spy.mockRestore();
  }

  it('creates index.hbs when handlebars is detected', async () => {
    await runInitWithEngine('handlebars', 'handlebars');
    const content = await readFile(join(tmpBase, 'inertia', 'index.hbs'), 'utf8');
    expect(content).toContain('@inertia');
  });

  it('creates index.ejs when ejs is detected', async () => {
    await runInitWithEngine('ejs', 'ejs');
    const content = await readFile(join(tmpBase, 'inertia', 'index.ejs'), 'utf8');
    expect(content).toContain('@inertia');
  });

  it('creates index.pug when pug is detected', async () => {
    await runInitWithEngine('pug', 'pug');
    const content = await readFile(join(tmpBase, 'inertia', 'index.pug'), 'utf8');
    expect(content).toContain('@inertia');
  });

  it('creates index.liquid when liquidjs is detected', async () => {
    await runInitWithEngine('liquid', 'liquidjs');
    const content = await readFile(join(tmpBase, 'inertia', 'index.liquid'), 'utf8');
    expect(content).toContain('@inertia');
  });
});

// ---------------------------------------------------------------------------
// detectFramework — devDependencies
// ---------------------------------------------------------------------------

describe('detectFramework — devDependencies', () => {
  it('detects @inertiajs/vue3 from devDependencies', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { devDependencies: { '@inertiajs/vue3': '^1.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('vue');
  });

  it('detects @inertiajs/svelte from devDependencies', async () => {
    const { detectFramework } = await import('../../src/cli/init.js');
    const pkg = { devDependencies: { '@inertiajs/svelte': '^1.0.0' } };
    await writeFile(join(tmpBase, 'package.json'), JSON.stringify(pkg), 'utf8');
    expect(await detectFramework(tmpBase)).toBe('svelte');
  });
});
