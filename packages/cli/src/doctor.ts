import { type ProjectTree, installedVersion } from './tree';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** One-line fix pointer (usually ending in a docs URL). Present on warn/fail. */
  fix?: string | undefined;
}

const DOCS = 'https://davidecarvalho.github.io/nestjs-inertia';

const SHELL_DIRS = ['inertia', 'views'];
const SHELL_NAMES = ['index', 'shell'];
const SHELL_EXTENSIONS = ['html', 'htm', 'hbs', 'ejs', 'pug', 'liquid'];
const ENTRY_CANDIDATES = ['inertia/app.tsx', 'inertia/app.ts', 'inertia/app.jsx'];
const VITE_MANIFEST_CANDIDATES = [
  'dist/inertia/client/.vite/manifest.json',
  'dist/inertia/.vite/manifest.json',
];
const REGISTRY_DTS_CANDIDATES = ['nestjs-inertia.d.ts', '.nestjs-inertia/pages.d.ts'];

/** Resolve the AppModule entry file: `app.moduleEntry` from the codegen config, or the default. */
export function moduleEntryPath(tree: ProjectTree): string {
  const config = tree.read('nestjs-codegen.config.ts');
  const match = config?.match(/moduleEntry\s*:\s*['"](?:\.\/)?([^'"]+)['"]/);
  return match?.[1] ?? 'src/app.module.ts';
}

function findShell(tree: ProjectTree): string | null {
  for (const dir of SHELL_DIRS) {
    for (const name of SHELL_NAMES) {
      for (const ext of SHELL_EXTENSIONS) {
        const candidate = `${dir}/${name}.${ext}`;
        if (tree.exists(candidate)) return candidate;
      }
    }
  }
  return null;
}

function versionAtLeast(version: string, major: number, minor: number, patch: number): boolean {
  const parts = version
    .replace(/[-+].*$/, '')
    .split('.')
    .map(Number);
  const [vMajor = 0, vMinor = 0, vPatch = 0] = parts;
  if (vMajor !== major) return vMajor > major;
  if (vMinor !== minor) return vMinor > minor;
  return vPatch >= patch;
}

/**
 * Run every doctor check against the project tree. Pure — no filesystem access beyond `tree`,
 * no output. The bin renders the results with `renderDoctorReport`.
 */
export function runDoctorChecks(tree: ProjectTree): CheckResult[] {
  const results: CheckResult[] = [];

  // -- Core package installed + streaming-safe version (>= 1.4.4) ---------------------------
  const coreVersion = installedVersion(tree, '@dudousxd/nestjs-inertia');
  results.push({
    name: '@dudousxd/nestjs-inertia installed',
    status: coreVersion ? 'pass' : 'fail',
    fix: coreVersion ? undefined : `Install @dudousxd/nestjs-inertia — ${DOCS}/guides/installation`,
  });
  if (coreVersion) {
    const streamingSafe = versionAtLeast(coreVersion, 1, 4, 4);
    results.push({
      name: `@dudousxd/nestjs-inertia >= 1.4.4 (streaming-response fix) — found ${coreVersion}`,
      status: streamingSafe ? 'pass' : 'warn',
      fix: streamingSafe
        ? undefined
        : `Versions before 1.4.4 hang streaming responses (SSE, downloads) — upgrade; ${DOCS}/guides/installation#engine-requirements`,
    });
  }

  // -- InertiaModule registered --------------------------------------------------------------
  const modulePath = moduleEntryPath(tree);
  const moduleSource = tree.read(modulePath);
  const moduleRegistered = moduleSource?.includes('InertiaModule.') ?? false;
  results.push({
    name: `InertiaModule registered in ${modulePath}`,
    status: moduleRegistered ? 'pass' : 'fail',
    fix: moduleRegistered
      ? undefined
      : `Add InertiaModule.forRoot({ rootView, codegen: { enabled: false } }) to your AppModule — ${DOCS}/getting-started`,
  });

  // -- Legacy auto-watch not left on ---------------------------------------------------------
  if (moduleRegistered && moduleSource) {
    const autoWatchDisabled = /codegen\s*:\s*\{\s*enabled\s*:\s*false/.test(moduleSource);
    results.push({
      name: 'InertiaModule codegen auto-watch disabled (enabled: false)',
      status: autoWatchDisabled ? 'pass' : 'warn',
      fix: autoWatchDisabled
        ? undefined
        : `Auto-watch targets the legacy @dudousxd/nestjs-inertia-codegen package; set codegen: { enabled: false } and run nestjs-codegen instead — ${DOCS}/guides/codegen#auto-watch`,
    });
  }

  // -- Codegen configured + CLI/module config drift guard -------------------------------------
  const codegenConfig = tree.read('nestjs-codegen.config.ts');
  const moduleUsesCodegenModule = moduleSource?.includes('NestjsCodegenModule') ?? false;
  const codegenConfigured = codegenConfig !== null || moduleUsesCodegenModule;
  results.push({
    name: 'Codegen configured (nestjs-codegen.config.ts or NestjsCodegenModule.forRoot)',
    status: codegenConfigured ? 'pass' : 'fail',
    fix: codegenConfigured
      ? undefined
      : `Create nestjs-codegen.config.ts with nestjsInertiaCodegen() in extensions — ${DOCS}/guides/codegen#configuration`,
  });
  if (codegenConfig !== null) {
    const configHasExtension = codegenConfig.includes('nestjsInertiaCodegen');
    results.push({
      name: 'nestjs-codegen.config.ts registers nestjsInertiaCodegen()',
      status: configHasExtension ? 'pass' : 'warn',
      fix: configHasExtension
        ? undefined
        : `Add nestjsInertiaCodegen() to extensions: [...] so api.ts gains the typed navigate() helper — ${DOCS}/packages/codegen#setup`,
    });
    if (moduleUsesCodegenModule && moduleSource) {
      const moduleHasExtension = moduleSource.includes('nestjsInertiaCodegen');
      const drifted = configHasExtension !== moduleHasExtension;
      results.push({
        name: 'CLI config and NestjsCodegenModule agree on extensions (no drift)',
        status: drifted ? 'warn' : 'pass',
        fix: drifted
          ? `The CLI config and NestjsCodegenModule.forRoot register different extensions — keep ONE shared config object imported into both entrypoints — ${DOCS}/packages/codegen#setup`
          : undefined,
      });
    }
  }

  // -- Root view shell + Vite entry ------------------------------------------------------------
  const shell = findShell(tree);
  results.push({
    name: shell ? `Root view shell exists (${shell})` : 'Root view shell exists',
    status: shell ? 'pass' : 'fail',
    fix: shell
      ? undefined
      : `Create inertia/index.html with @inertia / @inertiaHead / @vite directives (nestjs-inertia init scaffolds it) — ${DOCS}/getting-started#the-html-shell-and-its-directives`,
  });

  const entry = ENTRY_CANDIDATES.find((candidate) => tree.exists(candidate));
  results.push({
    name: entry ? `Vite entry exists (${entry})` : 'Vite entry exists (inertia/app.tsx)',
    status: entry ? 'pass' : 'fail',
    fix: entry
      ? undefined
      : `Create the createInertiaApp entry (nestjs-inertia init scaffolds it) — ${DOCS}/getting-started`,
  });

  // -- vite.config.ts references the nestInertia plugin ----------------------------------------
  const viteConfig = tree.read('vite.config.ts') ?? tree.read('vite.config.mts');
  if (viteConfig !== null) {
    const referencesPlugin =
      viteConfig.includes('nestInertia') || viteConfig.includes('nestjs-inertia-vite');
    results.push({
      name: 'vite.config.ts references the nestInertia plugin',
      status: referencesPlugin ? 'pass' : 'warn',
      fix: referencesPlugin
        ? undefined
        : `Add import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin' and register it in plugins — ${DOCS}/packages/vite`,
    });
  } else {
    results.push({
      name: 'vite.config.ts exists',
      status: 'warn',
      fix: `Create vite.config.ts with the nestInertia plugin (nestjs-inertia init scaffolds it) — ${DOCS}/getting-started`,
    });
  }

  // -- Vite manifest present after a build -----------------------------------------------------
  if (tree.exists('dist')) {
    const manifest = VITE_MANIFEST_CANDIDATES.find((candidate) => tree.exists(candidate));
    results.push({
      name: 'Vite client manifest exists in dist/ (post-build)',
      status: manifest ? 'pass' : 'warn',
      fix: manifest
        ? undefined
        : `dist/ exists but ${VITE_MANIFEST_CANDIDATES[0]} is missing — run vite build (build:client) before nest build so prod asset versioning works — ${DOCS}/getting-started#production-build`,
    });
  } else {
    results.push({ name: 'Vite client manifest (skipped — no dist/ build yet)', status: 'pass' });
  }

  // -- Registry .d.ts uses the current flat shape ----------------------------------------------
  const staleRegistry = REGISTRY_DTS_CANDIDATES.find((candidate) => {
    const contents = tree.read(candidate);
    return (
      contents !== null && /InertiaRegistry\s*(?:extends[^{]*)?\{[^}]*pages\s*:/s.test(contents)
    );
  });
  results.push({
    name: 'Registry .d.ts uses the current flat shape (InertiaPages, not InertiaRegistry.pages)',
    status: staleRegistry ? 'warn' : 'pass',
    fix: staleRegistry
      ? `${staleRegistry} nests pages under InertiaRegistry (legacy shape); current codegen augments the flat InertiaPages interface — regenerate with nestjs-codegen — ${DOCS}/guides/codegen#pagesdts`
      : undefined,
  });

  // -- Peer versions coherent -------------------------------------------------------------------
  const extensionVersion = installedVersion(tree, '@dudousxd/nestjs-inertia-codegen-extension');
  const codegenVersion = installedVersion(tree, '@dudousxd/nestjs-codegen');
  if (extensionVersion && !codegenVersion) {
    results.push({
      name: '@dudousxd/nestjs-codegen installed alongside the codegen extension',
      status: 'fail',
      fix: `The extension is a plugin for @dudousxd/nestjs-codegen — install it as a devDependency — ${DOCS}/guides/installation`,
    });
  } else if (extensionVersion && codegenVersion) {
    results.push({
      name: 'Codegen peer pair installed (@dudousxd/nestjs-codegen + inertia extension)',
      status: 'pass',
    });
  }
  const legacyCodegen = installedVersion(tree, '@dudousxd/nestjs-inertia-codegen');
  if (legacyCodegen) {
    results.push({
      name: 'Legacy @dudousxd/nestjs-inertia-codegen not installed',
      status: 'warn',
      fix: `@dudousxd/nestjs-inertia-codegen@${legacyCodegen} is the deleted legacy codegen — replace with @dudousxd/nestjs-codegen + @dudousxd/nestjs-inertia-codegen-extension — ${DOCS}/guides/codegen#install`,
    });
  }
  const adapters = ['@inertiajs/react', '@inertiajs/vue3', '@inertiajs/svelte'];
  const adapter = adapters
    .map((name) => ({ name, version: installedVersion(tree, name) }))
    .find((candidate) => candidate.version !== null);
  if (adapter?.version) {
    const v3 = versionAtLeast(adapter.version, 3, 0, 0);
    results.push({
      name: `${adapter.name} is v3+ — found ${adapter.version}`,
      status: v3 ? 'pass' : 'warn',
      fix: v3 ? undefined : `Upgrade ${adapter.name} to ^3.0.0 — ${DOCS}/getting-started`,
    });
  } else {
    results.push({
      name: 'Inertia frontend adapter installed (@inertiajs/react|vue3|svelte)',
      status: 'warn',
      fix: `Install your framework's Inertia v3 adapter — ${DOCS}/getting-started`,
    });
  }

  // -- .gitignore covers generated output --------------------------------------------------------
  const gitignore = tree.read('.gitignore');
  if (gitignore !== null) {
    const ignored = gitignore.includes('.nestjs-inertia');
    results.push({
      name: '.gitignore includes .nestjs-inertia/',
      status: ignored ? 'pass' : 'warn',
      fix: ignored
        ? undefined
        : `Add .nestjs-inertia/ to .gitignore (generated output) — ${DOCS}/guides/codegen#generated-file-management`,
    });
  }

  return results;
}

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** Render doctor results as terminal text. Returns the report and the process exit code. */
export function renderDoctorReport(results: CheckResult[]): { text: string; exitCode: number } {
  const lines: string[] = ['', `${BOLD}nestjs-inertia doctor${RESET}`, ''];
  for (const result of results) {
    const icon =
      result.status === 'pass'
        ? `${GREEN}✓${RESET}`
        : result.status === 'warn'
          ? `${YELLOW}!${RESET}`
          : `${RED}✗${RESET}`;
    lines.push(`  ${icon} ${result.name}`);
    if (result.fix && result.status !== 'pass') lines.push(`    ${DIM}${result.fix}${RESET}`);
  }
  const failures = results.filter((result) => result.status === 'fail').length;
  const warnings = results.filter((result) => result.status === 'warn').length;
  lines.push('');
  if (failures > 0) lines.push(`${RED}${failures} check(s) failed${RESET}`);
  if (warnings > 0) lines.push(`${YELLOW}${warnings} warning(s)${RESET}`);
  if (failures === 0 && warnings === 0) lines.push(`${GREEN}All checks passed!${RESET}`);
  lines.push('');
  return { text: lines.join('\n'), exitCode: failures > 0 ? 1 : 0 };
}
