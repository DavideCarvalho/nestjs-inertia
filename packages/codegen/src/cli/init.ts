import { execSync } from 'node:child_process';
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
    console.log(`✓ ${label} (already exists, skipping)`);
    return;
  }
  // Ensure parent directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, content, 'utf8');
  console.log(`+ ${label}`);
}

async function patchGitignore(gitignorePath: string): Promise<void> {
  let existing = '';
  if (await fileExists(gitignorePath)) {
    existing = await readFile(gitignorePath, 'utf8');
  }

  if (existing.split('\n').some((line) => line.trim() === GITIGNORE_ENTRY)) {
    console.log(`✓ .gitignore (already contains ${GITIGNORE_ENTRY}, skipping)`);
    return;
  }

  const newContent =
    existing.endsWith('\n') || existing === ''
      ? `${existing}${GITIGNORE_ENTRY}\n`
      : `${existing}\n${GITIGNORE_ENTRY}\n`;

  await writeFile(gitignorePath, newContent, 'utf8');
  console.log(`+ .gitignore (patched with ${GITIGNORE_ENTRY})`);
}

export function installDeps(pkgManager: PackageManager, deps: string[], dev: boolean): void {
  if (deps.length === 0) return;

  const flag = dev ? (pkgManager === 'npm' ? '--save-dev' : '-D') : '';
  const cmd =
    pkgManager === 'npm'
      ? `npm install ${flag} ${deps.join(' ')}`
      : pkgManager === 'yarn'
        ? `yarn add ${flag} ${deps.join(' ')}`
        : `pnpm add ${flag} ${deps.join(' ')}`;

  console.log(`\n[nestjs-inertia] Installing: ${deps.join(', ')}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    console.error(`[nestjs-inertia] Warning: failed to install deps. Run manually:\n  ${cmd}`);
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
    }
  }

  if (!changed) {
    console.log('✓ package.json scripts (already up to date, skipping)');
    return;
  }

  pkg.scripts = existing;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log('+ package.json (added build scripts)');
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

function htmlShellTemplate(framework: Framework, engine: TemplateEngine): string {
  const ext = framework === 'react' ? 'tsx' : 'ts';
  const pagePlaceholder =
    engine === 'ejs'
      ? '<%- page %>'
      : engine === 'pug'
        ? '!{page}'
        : engine === 'liquid'
          ? '{{ page }}'
          : '{{page}}';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
</head>
<body>
  <div id="app"></div>
  <script id="inertia-page" type="application/json">${pagePlaceholder}</script>
  <script type="module" src="/inertia/app.${ext}"></script>
</body>
</html>
`;
}

function viteConfigTemplate(framework: Framework): string {
  const pluginOption = `{ ${framework}: true }`;
  return `import { defineConfig } from 'vite';
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';

export default defineConfig({
  plugins: [nestInertia(${pluginOption})],
});
`;
}

function entryPointTemplate(framework: Framework): string {
  if (framework === 'react') {
    return `import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/*.tsx', { eager: true });
    return (pages as Record<string, unknown>)[\`./pages/\${name}.tsx\`];
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
    const pages = import.meta.glob('./pages/*.vue', { eager: true });
    return (pages as Record<string, unknown>)[\`./pages/\${name}.vue\`];
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
    const pages = import.meta.glob('./pages/*.svelte', { eager: true });
    return (pages as Record<string, unknown>)[\`./pages/\${name}.svelte\`];
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

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * `nestjs-inertia init` — scaffold a full Inertia.js project in `cwd`.
 *
 * Idempotent: each file is only written if it does not already exist.
 */
export async function runInit(opts: RunInitOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();

  // 1. Detect (or ask for) framework
  let framework = await detectFramework(cwd);
  if (!framework) {
    framework = await promptFramework();
  }
  console.log(`[nestjs-inertia] Framework: ${framework}`);

  // 2. Detect template engine
  const engine = await detectTemplateEngine(cwd);

  // 3. Scaffold files
  const shellFileName =
    engine === 'html' ? 'index.html' : `index.${engine === 'handlebars' ? 'hbs' : engine}`;
  const entryExt = framework === 'react' ? 'tsx' : 'ts';
  const pageExt = framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'svelte';

  await writeIfNotExists(
    join(cwd, 'nestjs-inertia.config.ts'),
    configTemplate(framework),
    'nestjs-inertia.config.ts',
  );

  await writeIfNotExists(join(cwd, 'nestjs-inertia.d.ts'), DTS_TEMPLATE, 'nestjs-inertia.d.ts');

  await patchGitignore(join(cwd, '.gitignore'));

  await writeIfNotExists(
    join(cwd, 'inertia', shellFileName),
    htmlShellTemplate(framework, engine),
    `inertia/${shellFileName}`,
  );

  await writeIfNotExists(
    join(cwd, 'vite.config.ts'),
    viteConfigTemplate(framework),
    'vite.config.ts',
  );

  await writeIfNotExists(
    join(cwd, 'inertia', `app.${entryExt}`),
    entryPointTemplate(framework),
    `inertia/app.${entryExt}`,
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

  // 4. Add build scripts to package.json
  await patchPackageJsonScripts(cwd, {
    'build:client': 'vite build',
    'build:ssr': 'VITE_SSR=1 vite build --ssr',
  });

  // 5. Install missing deps
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

  // 6. Print manual step instructions
  const rootView =
    engine === 'html'
      ? 'inertia/index.html'
      : `inertia/index.${engine === 'handlebars' ? 'hbs' : engine}`;

  console.log(`
✓ Scaffolding complete!

To finish setup, add these to your NestJS app:

1. Register InertiaModule in your AppModule:

   import { InertiaModule } from '@dudousxd/nestjs-inertia';

   @Module({
     imports: [
       InertiaModule.forRoot({
         version: '1',
         rootView: '${rootView}',
       }),
     ],
   })

2. Wire Vite in your main.ts:

   import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';

   const app = await NestFactory.create(AppModule);
   await setupInertiaVite(app, {
     mode: process.env.NODE_ENV ?? 'development',
     root: '.',
     publicDir: 'dist/inertia/client',
     outDir: 'dist/inertia',
   });

3. Register the HomeController in your AppModule's controllers array.

4. Run: ${pkgManager} start:dev

Visit http://localhost:3000 to see your first Inertia page!
`);
}
