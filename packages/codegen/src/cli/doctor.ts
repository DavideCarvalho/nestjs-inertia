import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Check {
  name: string;
  pass: boolean;
  fix?: string;
}

function checkFileExists(cwd: string, file: string): boolean {
  return existsSync(join(cwd, file));
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path, 'utf8').replace(/\/\/.*$/gm, '');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getPackageVersion(cwd: string, pkg: string): string | null {
  try {
    const pkgJson = readJson(join(cwd, 'node_modules', pkg, 'package.json'));
    return (pkgJson?.version as string) ?? null;
  } catch {
    return null;
  }
}

export async function runDoctor(opts: { cwd: string }): Promise<number> {
  const { cwd } = opts;
  const checks: Check[] = [];

  // 1. Config file
  checks.push({
    name: 'nestjs-inertia.config.ts exists',
    pass: checkFileExists(cwd, 'nestjs-inertia.config.ts'),
    fix: 'Run: pnpm exec nestjs-inertia init',
  });

  // 2. Codegen output
  const hasApi = checkFileExists(cwd, '.nestjs-inertia/api.ts');
  const hasRoutes = checkFileExists(cwd, '.nestjs-inertia/routes.ts');
  const hasPages = checkFileExists(cwd, '.nestjs-inertia/pages.d.ts');
  checks.push({
    name: '.nestjs-inertia/ codegen output exists',
    pass: hasApi && hasRoutes && hasPages,
    fix: 'Run: pnpm exec nestjs-inertia codegen',
  });

  // 3. tsconfig paths
  const tsconfig = readJson(join(cwd, 'tsconfig.json'));
  const paths = (tsconfig?.compilerOptions as Record<string, unknown>)?.paths as
    | Record<string, string[]>
    | undefined;
  checks.push({
    name: 'tsconfig.json has @/* path alias',
    pass: !!paths?.['@/*'],
    fix: 'Add to tsconfig.json compilerOptions.paths: { "@/*": ["./src/*"] }',
  });

  // 4. Inertia tsconfig (optional)
  const inertiaTsconfig = readJson(join(cwd, 'tsconfig.inertia.json'));
  if (inertiaTsconfig) {
    const inertiaPaths = (inertiaTsconfig.compilerOptions as Record<string, unknown>)?.paths as
      | Record<string, string[]>
      | undefined;
    checks.push({
      name: 'tsconfig.inertia.json has ~/* and ~codegen/* aliases',
      pass: !!inertiaPaths?.['~/*'] && !!inertiaPaths?.['~codegen/*'],
      fix: 'Add paths: { "~/*": ["inertia/*"], "~codegen/*": [".nestjs-inertia/*"] }',
    });
  }

  // 5. Vite config
  if (checkFileExists(cwd, 'vite.config.ts')) {
    const viteContent = readFileSync(join(cwd, 'vite.config.ts'), 'utf8');
    checks.push({
      name: 'vite.config.ts has resolve.alias',
      pass: viteContent.includes('resolve') && viteContent.includes('alias'),
      fix: 'Add resolve.alias with @→src, ~→inertia, ~codegen→.nestjs-inertia',
    });
    checks.push({
      name: 'vite.config.ts references nestjs-inertia',
      pass:
        viteContent.includes('nestInertia') ||
        viteContent.includes('nestjs-inertia') ||
        viteContent.includes('setupInertiaVite'),
      fix: "Add: import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin'",
    });
  }

  // 6. Package versions
  const libPackages = [
    '@dudousxd/nestjs-inertia',
    '@dudousxd/nestjs-inertia-codegen',
    '@dudousxd/nestjs-inertia-client',
    '@dudousxd/nestjs-inertia-vite',
    '@dudousxd/nestjs-inertia-testing',
  ];
  const versions = libPackages.map((pkg) => ({ pkg, version: getPackageVersion(cwd, pkg) }));
  const installed = versions.filter((v) => v.version !== null);
  const uniqueVersions = new Set(installed.map((v) => v.version));

  const requiredPkgs = [
    '@dudousxd/nestjs-inertia',
    '@dudousxd/nestjs-inertia-codegen',
    '@dudousxd/nestjs-inertia-client',
  ];
  const missingRequired = requiredPkgs.filter((pkg) => !getPackageVersion(cwd, pkg));
  checks.push({
    name: 'Core packages installed (core + codegen + client)',
    pass: missingRequired.length === 0,
    fix: missingRequired.length > 0 ? `Missing: ${missingRequired.join(', ')}` : undefined,
  });

  if (installed.length > 1) {
    checks.push({
      name: 'All packages on same version',
      pass: uniqueVersions.size === 1,
      fix: `Versions: ${installed.map((v) => `${v.pkg.replace('@dudousxd/', '')}@${v.version}`).join(', ')}`,
    });
  }

  // 7. Inertia.js version
  const inertiaReact = getPackageVersion(cwd, '@inertiajs/react');
  const inertiaVue = getPackageVersion(cwd, '@inertiajs/vue3');
  const inertiaSvelte = getPackageVersion(cwd, '@inertiajs/svelte');
  const inertiaVersion = inertiaReact ?? inertiaVue ?? inertiaSvelte;
  const inertiaFramework = inertiaReact
    ? 'react'
    : inertiaVue
      ? 'vue'
      : inertiaSvelte
        ? 'svelte'
        : null;

  if (inertiaVersion) {
    const majorVersion = Number.parseInt(inertiaVersion.split('.')[0] ?? '0', 10);
    checks.push({
      name: `@inertiajs/${inertiaFramework} is v3+`,
      pass: majorVersion >= 3,
      fix: `Current: v${inertiaVersion}. Run: pnpm add @inertiajs/${inertiaFramework}@^3.0.0`,
    });
  }

  // 8. .gitignore
  if (checkFileExists(cwd, '.gitignore')) {
    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf8');
    checks.push({
      name: '.gitignore includes .nestjs-inertia/',
      pass: gitignore.includes('.nestjs-inertia'),
      fix: 'Add .nestjs-inertia/ to .gitignore',
    });
  }

  // 9. Build scripts
  const pkgJson = readJson(join(cwd, 'package.json'));
  const scripts = (pkgJson?.scripts as Record<string, string>) ?? {};
  checks.push({
    name: 'package.json has build:client script',
    pass: !!scripts['build:client'],
    fix: 'Add: "build:client": "vite build"',
  });

  // Print results
  console.log('');
  console.log('\x1b[1mnestjs-inertia doctor\x1b[0m');
  console.log('');

  let hasFailures = false;
  for (const check of checks) {
    const icon = check.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${check.name}`);
    if (!check.pass && check.fix) {
      console.log(`    \x1b[2m${check.fix}\x1b[0m`);
      hasFailures = true;
    }
  }

  console.log('');
  if (hasFailures) {
    console.log(`\x1b[33m${checks.filter((c) => !c.pass).length} issue(s) found\x1b[0m`);
  } else {
    console.log('\x1b[32mAll checks passed!\x1b[0m');
  }
  console.log('');

  return hasFailures ? 1 : 0;
}
