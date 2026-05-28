import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface RunInitOptions {
  cwd?: string;
  /** Skip running package manager installs (useful for testing). */
  skipInstall?: boolean;
}

type Framework = 'react' | 'vue' | 'svelte';
type TemplateEngine = 'handlebars' | 'ejs' | 'pug' | 'liquid' | 'html';
type PackageManager = 'pnpm' | 'npm' | 'yarn';

const GITIGNORE_ENTRY = '.nestjs-inertia/';

// ---------------------------------------------------------------------------
// ANSI color helpers (no external deps)
// ---------------------------------------------------------------------------

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function logCreated(path: string) {
  console.log(`  ${green('✓')} ${path} ${dim('(created)')}`);
}
function logPatched(path: string, detail: string) {
  console.log(`  ${green('✓')} ${path} ${dim(`(${detail})`)}`);
}
function logSkipped(path: string) {
  console.log(`  ${cyan('→')} ${path} ${dim('(already exists, skipped)')}`);
}
function logWarning(msg: string) {
  console.log(`  ${yellow('⚠')} ${msg}`);
}
function logSection(title: string) {
  console.log(`\n${bold(title)}`);
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

async function readPackageJson(cwd: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function allDeps(pkg: Record<string, unknown>): string[] {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return [...Object.keys(deps), ...Object.keys(devDeps)];
}

export async function detectFramework(cwd: string): Promise<Framework | null> {
  const pkg = await readPackageJson(cwd);
  const deps = allDeps(pkg);

  if (deps.includes('@inertiajs/react') || deps.includes('react')) return 'react';
  if (deps.includes('@inertiajs/vue3') || deps.includes('vue')) return 'vue';
  if (deps.includes('@inertiajs/svelte') || deps.includes('svelte')) return 'svelte';
  return null;
}

export async function detectTemplateEngine(cwd: string): Promise<TemplateEngine> {
  const pkg = await readPackageJson(cwd);
  const deps = allDeps(pkg);

  if (deps.includes('handlebars')) return 'handlebars';
  if (deps.includes('ejs')) return 'ejs';
  if (deps.includes('pug')) return 'pug';
  if (deps.includes('liquidjs')) return 'liquid';
  return 'html';
}

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  async function exists(file: string): Promise<boolean> {
    try {
      await access(join(cwd, file));
      return true;
    } catch {
      return false;
    }
  }

  if (await exists('pnpm-lock.yaml')) return 'pnpm';
  if (await exists('yarn.lock')) return 'yarn';
  return 'npm';
}

async function promptFramework(): Promise<Framework> {
  // If not interactive (CI), default to React
  if (!process.stdin.isTTY) return 'react';

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      '[nestjs-inertia] Which frontend framework? (react/vue/svelte) [react]: ',
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === 'vue') resolve('vue');
        else if (trimmed === 'svelte') resolve('svelte');
        else resolve('react');
      },
    );
  });
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeIfNotExists(
  filePath: string,
  content: string,
  label: string,
): Promise<void> {
  if (await fileExists(filePath)) {
    logSkipped(label);
    return;
  }
  // Ensure parent directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, content, 'utf8');
  logCreated(label);
}

/**
 * Handle vite.config.ts — create if missing, warn if present without nestInertia plugin.
 */
async function handleViteConfig(cwd: string, framework: Framework): Promise<void> {
  const filePath = join(cwd, 'vite.config.ts');
  if (await fileExists(filePath)) {
    const existing = await readFile(filePath, 'utf8');
    const hasPlugin =
      existing.includes('nestInertia') || existing.includes('nestjs-inertia-vite/plugin');
    if (!hasPlugin) {
      logSkipped('vite.config.ts');
      logWarning(
        `vite.config.ts exists but nestInertia plugin not detected — add it manually:\n    import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';\n    plugins: [nestInertia({ ${framework}: true })]`,
      );
    } else {
      logSkipped('vite.config.ts');
    }
    return;
  }
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, viteConfigTemplate(framework), 'utf8');
  logCreated('vite.config.ts');
}

async function patchGitignore(gitignorePath: string): Promise<void> {
  let existing = '';
  if (await fileExists(gitignorePath)) {
    existing = await readFile(gitignorePath, 'utf8');
  }

  if (existing.split('\n').some((line) => line.trim() === GITIGNORE_ENTRY)) {
    console.log(`  ${cyan('→')} .gitignore ${dim('(already contains .nestjs-inertia/, skipped)')}`);
    return;
  }

  const newContent =
    existing.endsWith('\n') || existing === ''
      ? `${existing}${GITIGNORE_ENTRY}\n`
      : `${existing}\n${GITIGNORE_ENTRY}\n`;

  await writeFile(gitignorePath, newContent, 'utf8');
  logPatched('.gitignore', 'added .nestjs-inertia/');
}

export function installDeps(pkgManager: PackageManager, deps: string[], dev: boolean): void {
  if (deps.length === 0) return;

  const args: string[] = [];
  if (pkgManager === 'npm') {
    args.push('install');
    if (dev) args.push('--save-dev');
  } else {
    args.push('add');
    if (dev) args.push('-D');
  }
  args.push(...deps);

  logPatched(deps.join(', '), 'installed');
  try {
    execFileSync(pkgManager, args, { stdio: 'inherit' });
  } catch {
    logWarning(`Failed to install: ${deps.join(', ')}`);
  }
}

export async function patchPackageJsonScripts(
  cwd: string,
  scripts: Record<string, string>,
): Promise<void> {
  const pkgPath = join(cwd, 'package.json');
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return; // no package.json — skip
  }

  const existing = (pkg.scripts ?? {}) as Record<string, string>;
  let changed = false;

  for (const [key, value] of Object.entries(scripts)) {
    if (!(key in existing)) {
      existing[key] = value;
      changed = true;
      logPatched('package.json', `added ${key} script`);
    } else {
      console.log(`  ${cyan('→')} package.json ${dim(`(${key} already defined, skipped)`)}`);
    }
  }

  if (!changed) {
    return;
  }

  pkg.scripts = existing;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Module patching helpers
// ---------------------------------------------------------------------------

/**
 * Find the position just after the last import statement in a file.
 * Handles files where the first line starts with `import` (no leading newline).
 */
function findAfterLastImport(content: string): number {
  // Try \nimport first (import not on the first line)
  const lastImportIndex = content.lastIndexOf('\nimport ');
  if (lastImportIndex !== -1) {
    const endOfLine = content.indexOf('\n', lastImportIndex + 1);
    return endOfLine !== -1 ? endOfLine + 1 : content.length;
  }
  // Fallback: import at the very start of the file
  if (content.startsWith('import ')) {
    const endOfLine = content.indexOf('\n');
    return endOfLine !== -1 ? endOfLine + 1 : content.length;
  }
  return 0;
}

/**
 * Patch `src/app.module.ts` to add InertiaModule.forRoot() and HomeController.
 * Returns 'patched' | 'already' | 'skipped'
 */
export function patchAppModule(
  filePath: string,
  rootView: string,
): 'patched' | 'already' | 'skipped' {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return 'skipped';
  }

  let changed = false;

  // --- InertiaModule ---
  if (!content.includes('InertiaModule')) {
    const insertAt = findAfterLastImport(content);
    if (insertAt > 0) {
      content = `${content.slice(0, insertAt)}import { InertiaModule } from '@dudousxd/nestjs-inertia';\n${content.slice(insertAt)}`;
    }

    // Ensure `resolve` from node:path is imported (needed for rootView)
    if (!content.includes("from 'node:path'") && !content.includes('from "node:path"')) {
      const insertAt2 = findAfterLastImport(content);
      content = `${content.slice(0, insertAt2)}import { resolve } from 'node:path';\n${content.slice(insertAt2)}`;
    }

    // Find `imports: [` and insert after the opening bracket
    const importsMatch = content.match(/imports\s*:\s*\[/);
    if (importsMatch?.index !== undefined) {
      const bracketPos = content.indexOf('[', importsMatch.index) + 1;
      const indent = '    ';
      content = `${content.slice(0, bracketPos)}\n${indent}InertiaModule.forRoot({\n${indent}  rootView: resolve(__dirname, '../${rootView}'),\n${indent}}),${content.slice(bracketPos)}`;
      changed = true;
    }
  }

  // --- HomeController ---
  if (!content.includes('HomeController')) {
    const insertAt = findAfterLastImport(content);
    if (insertAt > 0) {
      content = `${content.slice(0, insertAt)}import { HomeController } from './home.controller';\n${content.slice(insertAt)}`;
    }

    // Find `controllers: [` and insert after the opening bracket
    const controllersMatch = content.match(/controllers\s*:\s*\[/);
    if (controllersMatch?.index !== undefined) {
      const bracketPos = content.indexOf('[', controllersMatch.index) + 1;
      const indent = '    ';
      content = `${content.slice(0, bracketPos)}\n${indent}HomeController,${content.slice(bracketPos)}`;
      changed = true;
    }
  }

  if (!changed) return 'already';

  writeFileSync(filePath, content, 'utf8');
  return 'patched';
}

/**
 * Patch `src/main.ts` to add setupInertiaVite() call.
 * Returns 'patched' | 'already' | 'skipped'
 */
export function patchMainTs(filePath: string): 'patched' | 'already' | 'skipped' {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return 'skipped';
  }

  if (content.includes('setupInertiaVite')) return 'already';

  // Add import after the last import statement
  const insertAt = findAfterLastImport(content);
  if (insertAt > 0) {
    content = `${content.slice(0, insertAt)}import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';\n${content.slice(insertAt)}`;
  }

  // Find NestFactory.create assignment line
  const createMatch = content.match(
    /(?:const|let)\s+(\w+)\s*=\s*await\s+NestFactory\.create[^;]+;/,
  );
  if (!createMatch || createMatch.index === undefined) return 'skipped';

  const appVarName = createMatch[1];
  const insertAfterPos = createMatch.index + createMatch[0].length;

  const viteSetup = `
  // Inertia + Vite integration (dev: HMR middleware, prod: static assets)
  await setupInertiaVite(${appVarName}, {
    mode: process.env.NODE_ENV ?? 'development',
    root: 'inertia',
    publicDir: 'dist/inertia/client',
    outDir: 'dist/inertia',
  });`;

  content = `${content.slice(0, insertAfterPos)}\n${viteSetup}${content.slice(insertAfterPos)}`;
  writeFileSync(filePath, content, 'utf8');
  return 'patched';
}

// ---------------------------------------------------------------------------
// Template generators
// ---------------------------------------------------------------------------

function configTemplate(framework: Framework): string {
  const glob =
    framework === 'react'
      ? 'inertia/pages/**/*.tsx'
      : framework === 'vue'
        ? 'inertia/pages/**/*.vue'
        : 'inertia/pages/**/*.svelte';

  return `import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    glob: '${glob}',
  },
});
`;
}

/**
 * Standalone tsconfig that typechecks the inertia/ frontend + the codegen
 * output under .nestjs-inertia/. Lives at the project root and is invoked
 * via `pnpm typecheck:inertia` (or equivalent).
 *
 * Why a separate file:
 *  - The server tsconfig excludes inertia/ (Vite-only APIs break nest build)
 *  - The codegen emits imports like `import('../src/.../foo.controller')`,
 *    so we need `experimentalDecorators` here to parse those controllers.
 *    Decorator metadata is OFF so users don't get TS1272 leaks from src/.
 *  - `@/*` resolves to BOTH `inertia/*` AND `src/*` because the codegen's
 *    transitive imports use `@/` to mean `src/`, while inertia/ user code
 *    uses `@/` to mean `inertia/`.
 */
export const TSCONFIG_INERTIA_TEMPLATE = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "types": ["vite/client", "node"],
    "allowImportingTsExtensions": false,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "incremental": true,
    "skipLibCheck": true,
    "strict": false,
    "strictNullChecks": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": false,
    "useUnknownInCatchVariables": false,
    "noImplicitAny": false,
    "ignoreDeprecations": "6.0",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./inertia/*", "./src/*"],
      "~/*": ["./inertia/*"],
      "~codegen/*": ["./.nestjs-inertia/*"]
    }
  },
  "include": [
    "inertia/**/*",
    ".nestjs-inertia/**/*",
    "nestjs-inertia.d.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "inertia/**/*.test.ts",
    "inertia/**/*.test.tsx",
    "inertia/**/*.spec.ts",
    "inertia/**/*.spec.tsx"
  ]
}
`;

/**
 * Thin tsconfig inside inertia/ that just extends the root config. Lets
 * VSCode (and other editors that walk up to find a tsconfig) pick up the
 * inertia-aware aliases automatically when opening files in inertia/.
 */
export const INERTIA_TSCONFIG_TEMPLATE = `{
  "extends": "../tsconfig.inertia.json",
  "include": [
    "**/*",
    "../.nestjs-inertia/**/*",
    "../nestjs-inertia.d.ts"
  ],
  "exclude": [
    "node_modules",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
`;

const DTS_TEMPLATE = `// Auto-generated by nestjs-inertia-codegen. Commit this file.
// Re-run \`nestjs-inertia codegen\` to refresh after adding/removing pages.

import '.nestjs-inertia/index.js';

declare module '@dudousxd/nestjs-inertia' {
  interface InertiaRegistry {
    pages: import('.nestjs-inertia/pages.js').InertiaPages;
    shared: import('.nestjs-inertia/shared.js').InertiaSharedProps;
    routes: import('.nestjs-inertia/routes.js').RouteParamsMap;
  }
}
`;

function htmlShellTemplate(framework: Framework, _engine: TemplateEngine): string {
  const ext = framework === 'react' ? 'tsx' : 'ts';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
  @inertiaHead
</head>
<body>
  @inertia
  @vite('app/client.${ext}')
</body>
</html>
`;
}

function viteConfigTemplate(framework: Framework): string {
  const pluginOption = `{ ${framework}: true }`;
  return `import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';

export default defineConfig({
  plugins: [nestInertia(${pluginOption})],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '~': resolve(__dirname, 'inertia'),
      '~codegen': resolve(__dirname, '.nestjs-inertia'),
    },
  },
});
`;
}

function entryPointTemplate(framework: Framework): string {
  if (framework === 'react') {
    return `import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('../pages/**/*.tsx', { eager: true });
    return (pages as Record<string, unknown>)[\`../pages/\${name}.tsx\`];
  },
  setup({ el, App, props }) {
    createRoot(el!).render(<App {...props} />);
  },
});
`;
  }

  if (framework === 'vue') {
    return `import { createApp, h } from 'vue';
import { createInertiaApp } from '@inertiajs/vue3';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('../pages/**/*.vue', { eager: true });
    return (pages as Record<string, unknown>)[\`../pages/\${name}.vue\`];
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(App, props) }).use(plugin).mount(el!);
  },
});
`;
  }

  // svelte
  return `import { mount } from 'svelte';
import { createInertiaApp } from '@inertiajs/svelte';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('../pages/**/*.svelte', { eager: true });
    return (pages as Record<string, unknown>)[\`../pages/\${name}.svelte\`];
  },
  setup({ el, App, props }) {
    mount(App, { target: el!, props });
  },
});
`;
}

function samplePageTemplate(framework: Framework): string {
  if (framework === 'react') {
    return `export type ComponentProps = {
  greeting: string;
};

export default function Home({ greeting }: ComponentProps) {
  return (
    <main>
      <h1>{greeting}</h1>
      <p>Edit this page at <code>inertia/pages/Home.tsx</code></p>
    </main>
  );
}
`;
  }

  if (framework === 'vue') {
    return `<script setup lang="ts">
defineProps<{ greeting: string }>();
</script>

<template>
  <main>
    <h1>{{ greeting }}</h1>
    <p>Edit this page at <code>inertia/pages/Home.vue</code></p>
  </main>
</template>
`;
  }

  // svelte
  return `<script lang="ts">
  let { greeting } = $props<{ greeting: string }>();
</script>

<main>
  <h1>{greeting}</h1>
  <p>Edit this page at <code>inertia/pages/Home.svelte</code></p>
</main>
`;
}

const SAMPLE_CONTROLLER = `import { Controller, Get } from '@nestjs/common';
import { Inertia } from '@dudousxd/nestjs-inertia';

@Controller()
export class HomeController {
  @Get('/')
  @Inertia('Home')
  index() {
    return { greeting: 'Welcome to NestJS + Inertia.js!' };
  }
}
`;

/**
 * Patch `tsconfig.json` to exclude `inertia/` from the server-side TypeScript compilation.
 * Without this, `nest build` fails because `inertia/` files use Vite-only APIs like
 * `import.meta.glob` that are invalid in a Node.js/CommonJS context.
 */
export function patchTsconfigExclude(
  cwd: string,
  dir: string,
  filename = 'tsconfig.json',
): 'patched' | 'already' | 'skipped' {
  const filePath = join(cwd, filename);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return 'skipped';
  }

  // Strip single-line comments for JSON.parse, but keep the original for rewrite
  const stripped = raw.replace(/\/\/.*$/gm, '');
  const json = JSON.parse(stripped) as Record<string, unknown>;
  const exclude = (json.exclude ?? []) as string[];

  if (exclude.includes(dir)) return 'already';

  exclude.push(dir);
  json.exclude = exclude;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return 'patched';
}

/**
 * Patch `nest-cli.json` so `nest build` copies the shell template into `dist/`.
 * Without this, Docker images that only ship `dist/` would be missing the rootView file.
 */
export function patchNestCliJson(cwd: string, shellDir: string): 'patched' | 'already' | 'skipped' {
  const filePath = join(cwd, 'nest-cli.json');
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return 'skipped';
  }

  const json = JSON.parse(raw) as Record<string, unknown>;
  const compiler = (json.compilerOptions ?? {}) as Record<string, unknown>;
  const assets = (compiler.assets ?? []) as Array<string | Record<string, unknown>>;

  const alreadyHas = assets.some((a) => {
    if (typeof a === 'string') return a.includes(shellDir);
    return String(a.include ?? '').includes(shellDir);
  });
  if (alreadyHas) return 'already';

  assets.push({
    include: `../${shellDir}/**/*`,
    outDir: `dist/${shellDir}`,
    watchAssets: true,
  });
  compiler.assets = assets;
  json.compilerOptions = compiler;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return 'patched';
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * `nestjs-inertia init` — scaffold a full Inertia.js project in `cwd`.
 *
 * Idempotent: each file is only written if it does not already exist.
 * Smart patching: existing files are checked and patched where safe.
 */
export async function runInit(opts: RunInitOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();

  console.log(`\n${bold('nestjs-inertia init')}`);

  // 1. Detect (or ask for) framework
  let framework = await detectFramework(cwd);
  if (!framework) {
    framework = await promptFramework();
  }

  // 2. Detect template engine
  const engine = await detectTemplateEngine(cwd);

  const engineLabel = engine === 'html' ? 'plain HTML' : engine;
  const frameworkLabel = framework.charAt(0).toUpperCase() + framework.slice(1);
  console.log(`\n  Detected: ${bold(`${frameworkLabel} + ${engineLabel}`)}`);

  // 3. Scaffold files
  const shellFileName =
    engine === 'html' ? 'index.html' : `index.${engine === 'handlebars' ? 'hbs' : engine}`;
  const entryExt = framework === 'react' ? 'tsx' : 'ts';
  const pageExt = framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'svelte';

  logSection('Scaffold files');

  await writeIfNotExists(
    join(cwd, 'nestjs-inertia.config.ts'),
    configTemplate(framework),
    'nestjs-inertia.config.ts',
  );

  await writeIfNotExists(join(cwd, 'nestjs-inertia.d.ts'), DTS_TEMPLATE, 'nestjs-inertia.d.ts');

  // Dedicated tsconfig for the inertia/ frontend + codegen output. The
  // server tsconfig.json can't typecheck inertia/ because Vite-only APIs
  // (import.meta.glob etc.) break nest build; this one fills that gap.
  await writeIfNotExists(
    join(cwd, 'tsconfig.inertia.json'),
    TSCONFIG_INERTIA_TEMPLATE,
    'tsconfig.inertia.json',
  );

  // Thin tsconfig under inertia/ so VSCode/editors that walk up looking
  // for the closest tsconfig pick up the inertia-aware aliases (~codegen,
  // ~/*) when opening files in inertia/.
  await writeIfNotExists(
    join(cwd, 'inertia', 'tsconfig.json'),
    INERTIA_TSCONFIG_TEMPLATE,
    'inertia/tsconfig.json',
  );

  await writeIfNotExists(
    join(cwd, 'inertia', shellFileName),
    htmlShellTemplate(framework, engine),
    `inertia/${shellFileName}`,
  );

  await handleViteConfig(cwd, framework);

  await writeIfNotExists(
    join(cwd, 'inertia', 'app', `client.${entryExt}`),
    entryPointTemplate(framework),
    `inertia/app/client.${entryExt}`,
  );

  await writeIfNotExists(
    join(cwd, 'inertia', 'pages', `Home.${pageExt}`),
    samplePageTemplate(framework),
    `inertia/pages/Home.${pageExt}`,
  );

  await writeIfNotExists(
    join(cwd, 'src', 'home.controller.ts'),
    SAMPLE_CONTROLLER,
    'src/home.controller.ts',
  );

  // 4. Patch app.module.ts and main.ts
  logSection('Patch existing files');

  const rootView =
    engine === 'html'
      ? 'inertia/index.html'
      : `inertia/index.${engine === 'handlebars' ? 'hbs' : engine}`;

  const appModulePath = join(cwd, 'src', 'app.module.ts');
  const appModuleResult = patchAppModule(appModulePath, rootView);
  if (appModuleResult === 'patched') {
    logPatched('src/app.module.ts', 'added InertiaModule.forRoot');
    logPatched('src/app.module.ts', 'added HomeController to controllers');
  } else if (appModuleResult === 'already') {
    console.log(
      `  ${cyan('→')} src/app.module.ts ${dim('(InertiaModule already registered, skipped)')}`,
    );
  } else {
    logWarning('src/app.module.ts not found — add InertiaModule.forRoot() manually');
  }

  const mainTsPath = join(cwd, 'src', 'main.ts');
  const mainTsResult = patchMainTs(mainTsPath);
  if (mainTsResult === 'patched') {
    logPatched('src/main.ts', 'added setupInertiaVite after NestFactory.create');
  } else if (mainTsResult === 'already') {
    console.log(`  ${cyan('→')} src/main.ts ${dim('(setupInertiaVite already present, skipped)')}`);
  } else {
    logWarning('src/main.ts not found — add setupInertiaVite() manually');
  }

  // Patch nest-cli.json so `nest build` copies the shell template into dist/
  const shellDir = rootView.split('/')[0]!; // e.g. "inertia" from "inertia/index.html"
  const nestCliResult = patchNestCliJson(cwd, shellDir);
  if (nestCliResult === 'patched') {
    logPatched('nest-cli.json', `added asset copy for ${shellDir}/ → dist/${shellDir}/`);
  } else if (nestCliResult === 'already') {
    console.log(
      `  ${cyan('→')} nest-cli.json ${dim(`(${shellDir}/ asset already configured, skipped)`)}`,
    );
  } else {
    logWarning('nest-cli.json not found — copy the shell template into dist/ manually');
  }

  // Patch tsconfig.json and tsconfig.build.json to exclude the inertia/ dir
  // from the server build. tsconfig.build.json's own `exclude` array overrides
  // the base tsconfig.json when present, so both must be patched.
  for (const tsconfigFile of ['tsconfig.json', 'tsconfig.build.json']) {
    const result = patchTsconfigExclude(cwd, shellDir, tsconfigFile);
    if (result === 'patched') {
      logPatched(tsconfigFile, `excluded ${shellDir}/ from server compilation`);
    } else if (result === 'already') {
      console.log(
        `  ${cyan('→')} ${tsconfigFile} ${dim(`(${shellDir}/ already excluded, skipped)`)}`,
      );
    }
    // 'skipped' = file doesn't exist, silently move on
  }

  await patchGitignore(join(cwd, '.gitignore'));

  // Patch tsconfig.json to also exclude `dist` so the server typecheck
  // doesn't walk compiled artifacts under dist/inertia/* and report
  // phantom errors about unresolved aliases in the compiled tree.
  const tsconfigDistResult = patchTsconfigExclude(cwd, 'dist', 'tsconfig.json');
  if (tsconfigDistResult === 'patched') {
    logPatched('tsconfig.json', 'excluded dist/ from server compilation');
  } else if (tsconfigDistResult === 'already') {
    console.log(`  ${cyan('→')} tsconfig.json ${dim('(dist/ already excluded, skipped)')}`);
  }

  // 5. Add build scripts to package.json
  await patchPackageJsonScripts(cwd, {
    'build:client': 'vite build',
    'build:ssr': 'VITE_SSR=1 vite build --ssr',
    'typecheck:inertia': 'tsc --noEmit -p tsconfig.inertia.json',
  });

  // 6. Install missing deps
  logSection('Install dependencies');

  const pkg = await readPackageJson(cwd);
  const installedDeps = allDeps(pkg);
  const pkgManager = await detectPackageManager(cwd);

  const commonDeps = ['vite'].filter((d) => !installedDeps.includes(d));

  let frameworkDeps: string[] = [];
  let frameworkDevDeps: string[] = [];

  if (framework === 'react') {
    const needed = ['@inertiajs/react', 'react', 'react-dom'].filter(
      (d) => !installedDeps.includes(d),
    );
    const neededDev = ['@types/react', '@types/react-dom', '@vitejs/plugin-react'].filter(
      (d) => !installedDeps.includes(d),
    );
    frameworkDeps = needed;
    frameworkDevDeps = neededDev;
  } else if (framework === 'vue') {
    const needed = ['@inertiajs/vue3', 'vue'].filter((d) => !installedDeps.includes(d));
    const neededDev = ['@vitejs/plugin-vue'].filter((d) => !installedDeps.includes(d));
    frameworkDeps = needed;
    frameworkDevDeps = neededDev;
  } else {
    const needed = ['@inertiajs/svelte', 'svelte'].filter((d) => !installedDeps.includes(d));
    const neededDev = ['@sveltejs/vite-plugin-svelte'].filter((d) => !installedDeps.includes(d));
    frameworkDeps = needed;
    frameworkDevDeps = neededDev;
  }

  const depsToInstall = [...commonDeps, ...frameworkDeps];
  const devDepsToInstall = frameworkDevDeps;

  if (!opts.skipInstall) {
    installDeps(pkgManager, depsToInstall, false);
    installDeps(pkgManager, devDepsToInstall, true);
  }

  console.log(`\n${green('✓')} Setup complete! Run: ${bold('nest start --watch')}\n`);
}
