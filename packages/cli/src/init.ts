import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type ProjectTree, readJson } from './tree';

export type Framework = 'react' | 'vue' | 'svelte';

export interface InitOptions {
  framework?: Framework | undefined;
  /** Overwrite files that already exist. */
  force?: boolean | undefined;
}

export interface FileAction {
  path: string;
  kind: 'create' | 'overwrite' | 'append' | 'skip';
  /** Full contents to write (for append: the full new contents). Absent for skip. */
  contents?: string | undefined;
  /** Human-readable reason, shown in the summary / dry-run. */
  reason: string;
}

export interface InitPlan {
  framework: Framework;
  frameworkDetected: boolean;
  actions: FileAction[];
}

/** Detect the frontend framework from package.json dependencies. */
export function detectFramework(tree: ProjectTree): Framework | null {
  const pkg = readJson(tree, 'package.json');
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };
  if (deps['@inertiajs/react'] || deps.react) return 'react';
  if (deps['@inertiajs/vue3'] || deps.vue) return 'vue';
  if (deps['@inertiajs/svelte'] || deps.svelte) return 'svelte';
  return null;
}

const PAGE_EXTENSION: Record<Framework, string> = { react: 'tsx', vue: 'vue', svelte: 'svelte' };
const ENTRY_FILE: Record<Framework, string> = {
  react: 'inertia/app.tsx',
  vue: 'inertia/app.ts',
  svelte: 'inertia/app.ts',
};

function codegenConfigTemplate(framework: Framework): string {
  return `import { defineConfig } from '@dudousxd/nestjs-codegen';
import { nestjsInertiaCodegen } from '@dudousxd/nestjs-inertia-codegen-extension';

/**
 * Shared codegen config — the single source of truth for BOTH codegen entrypoints:
 *
 *   1. the CLI / CI:      \`pnpm nestjs-codegen\` (reads this file)
 *   2. the Nest module:   \`NestjsCodegenModule.forRoot(codegenConfig)\` in app.module.ts
 *      (import { codegenConfig } from '../nestjs-codegen.config')
 *
 * Registering different options in each entrypoint makes the two generators drift —
 * keep this object as the only definition and import it everywhere.
 */
export const codegenConfig = {
  pages: {
    glob: 'inertia/pages/**/*.${PAGE_EXTENSION[framework]}',
  },
  app: {
    moduleEntry: './src/app.module.ts',
  },
  contracts: {
    glob: 'src/**/*.controller.ts',
  },
  codegen: {
    outDir: '.nestjs-inertia',
  },
  extensions: [nestjsInertiaCodegen()],
};

export default defineConfig(codegenConfig);
`;
}

const REGISTRY_DTS_TEMPLATE = `/**
 * Handwritten module augmentation for @dudousxd/nestjs-inertia.
 *
 * The codegen (\`pnpm nestjs-codegen\`) emits the generated augmentations into
 * \`.nestjs-inertia/pages.d.ts\` using the CURRENT flat shape — it augments the
 * \`InertiaPages\` interface directly (one key per page). The legacy shape that nested
 * pages inside the registry interface is no longer emitted; \`nestjs-inertia doctor\`
 * warns if it finds it.
 *
 * Use this file only for augmentations you write by hand (e.g. typed shared props):
 *
 *   declare module '@dudousxd/nestjs-inertia' {
 *     interface InertiaSharedProps {
 *       auth: { userId: string } | null;
 *     }
 *   }
 */
export {};
`;

function shellTemplate(framework: Framework): string {
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
    @vite('${ENTRY_FILE[framework]}')
  </body>
</html>
`;
}

function entryTemplate(framework: Framework): string {
  if (framework === 'react') {
    return `import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

void createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx', { eager: true });
    return pages[\`./pages/\${name}.tsx\`];
  },
  setup({ el, App, props }) {
    if (!el) throw new Error('Inertia root element not found');
    createRoot(el).render(<App {...props} />);
  },
});
`;
  }
  if (framework === 'vue') {
    return `import { createInertiaApp } from '@inertiajs/vue3';
import { createApp, h } from 'vue';

void createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.vue', { eager: true });
    return pages[\`./pages/\${name}.vue\`];
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(App, props) })
      .use(plugin)
      .mount(el);
  },
});
`;
  }
  return `import { createInertiaApp } from '@inertiajs/svelte';
import { mount } from 'svelte';

void createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.svelte', { eager: true });
    return pages[\`./pages/\${name}.svelte\`];
  },
  setup({ el, App, props }) {
    if (!el) throw new Error('Inertia root element not found');
    mount(App, { target: el, props });
  },
});
`;
}

function viteConfigTemplate(framework: Framework): string {
  const plugin =
    framework === 'react'
      ? { importLine: "import react from '@vitejs/plugin-react';", call: 'react()' }
      : framework === 'vue'
        ? { importLine: "import vue from '@vitejs/plugin-vue';", call: 'vue()' }
        : {
            importLine: "import { svelte } from '@sveltejs/vite-plugin-svelte';",
            call: 'svelte()',
          };
  return `import { resolve } from 'node:path';
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';
${plugin.importLine}
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [${plugin.call}, nestInertia()],
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

function planFile(tree: ProjectTree, force: boolean, path: string, contents: string): FileAction {
  if (!tree.exists(path)) return { path, kind: 'create', contents, reason: 'created' };
  if (force) return { path, kind: 'overwrite', contents, reason: 'overwritten (--force)' };
  return { path, kind: 'skip', reason: 'already exists — use --force to overwrite' };
}

/**
 * Compute what `init` would do, without touching the filesystem. Pure over `tree` so tests
 * exercise it against in-memory fixtures; `runInit` applies the returned actions.
 */
export function planInit(tree: ProjectTree, options: InitOptions = {}): InitPlan {
  const detected = detectFramework(tree);
  const framework = options.framework ?? detected ?? 'react';
  const force = options.force ?? false;

  const actions: FileAction[] = [
    planFile(tree, force, 'nestjs-codegen.config.ts', codegenConfigTemplate(framework)),
    planFile(tree, force, 'nestjs-inertia.d.ts', REGISTRY_DTS_TEMPLATE),
    planFile(tree, force, 'inertia/index.html', shellTemplate(framework)),
    planFile(tree, force, ENTRY_FILE[framework], entryTemplate(framework)),
    planFile(tree, force, 'vite.config.ts', viteConfigTemplate(framework)),
  ];

  const gitignore = tree.read('.gitignore');
  if (gitignore === null) {
    actions.push({
      path: '.gitignore',
      kind: 'create',
      contents: '.nestjs-inertia/\n',
      reason: 'created (ignores generated output)',
    });
  } else if (!gitignore.includes('.nestjs-inertia')) {
    const separator = gitignore.endsWith('\n') ? '' : '\n';
    actions.push({
      path: '.gitignore',
      kind: 'append',
      contents: `${gitignore}${separator}.nestjs-inertia/\n`,
      reason: 'appended .nestjs-inertia/',
    });
  } else {
    actions.push({ path: '.gitignore', kind: 'skip', reason: 'already ignores .nestjs-inertia/' });
  }

  return { framework, frameworkDetected: detected !== null, actions };
}

/** The manual wiring `init` cannot safely automate, printed as next steps. */
export function nextStepsText(framework: Framework): string {
  return `Next steps (manual wiring):

1. Register InertiaModule in src/app.module.ts — note codegen: { enabled: false }
   (the module's legacy auto-watch targets the old codegen package; the
   @dudousxd/nestjs-codegen CLI below replaces it):

     import { resolve } from 'node:path';
     import { InertiaModule } from '@dudousxd/nestjs-inertia';

     @Module({
       imports: [
         InertiaModule.forRoot({
           rootView: resolve(__dirname, '../inertia/index.html'),
           codegen: { enabled: false },
         }),
       ],
     })
     export class AppModule {}

   Optional — to also run codegen from the Nest module in dev, import the SHARED
   config so the CLI and module never drift:

     import { NestjsCodegenModule } from '@dudousxd/nestjs-codegen/nest';
     import { codegenConfig } from '../nestjs-codegen.config';
     // imports: [NestjsCodegenModule.forRoot(codegenConfig)]

2. Wire Vite in src/main.ts, right after NestFactory.create:

     const { setupInertiaVite } = await import('@dudousxd/nestjs-inertia-vite');
     await setupInertiaVite(app, {
       mode: process.env.NODE_ENV ?? 'development',
       root: 'inertia',
       publicDir: 'dist/inertia/client',
       outDir: 'dist/inertia',
     });

3. Add scripts to package.json:

     "codegen": "nestjs-codegen",
     "codegen:watch": "nestjs-codegen --watch",
     "build:client": "vite build"

4. Generate the typed client, then start the app:

     pnpm nestjs-codegen
     nest start --watch    (+ pnpm nestjs-codegen --watch in a second terminal)

5. Verify the setup any time with: nestjs-inertia doctor

Docs: https://davidecarvalho.github.io/nestjs-inertia/getting-started (framework: ${framework})
`;
}

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** Render the plan as terminal text. In dry-run mode, shows what WOULD be written. */
export function renderInitPlan(plan: InitPlan, dryRun: boolean): string {
  const lines: string[] = [
    '',
    `${BOLD}nestjs-inertia init${dryRun ? ' --dry-run' : ''}${RESET} ${DIM}(framework: ${plan.framework}${plan.frameworkDetected ? ', detected' : ', default — pass --framework to change'})${RESET}`,
    '',
  ];
  for (const action of plan.actions) {
    if (action.kind === 'skip') {
      lines.push(`  ${CYAN}=${RESET} ${action.path} ${DIM}(${action.reason})${RESET}`);
      continue;
    }
    const lineCount = action.contents?.split('\n').length ?? 0;
    const verb = dryRun ? `would be ${action.reason}` : action.reason;
    const symbol = action.kind === 'append' ? `${YELLOW}~${RESET}` : `${GREEN}+${RESET}`;
    lines.push(`  ${symbol} ${action.path} ${DIM}(${verb}, ${lineCount} lines)${RESET}`);
  }
  return lines.join('\n');
}

/** Apply an init plan to the real filesystem rooted at `cwd`. */
export function applyInitPlan(plan: InitPlan, cwd: string): void {
  for (const action of plan.actions) {
    if (action.kind === 'skip' || action.contents === undefined) continue;
    const target = join(cwd, action.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, action.contents, 'utf8');
  }
}
