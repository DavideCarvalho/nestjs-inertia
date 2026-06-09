import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCodegen } from './codegen.js';
import {
  INERTIA_TSCONFIG_TEMPLATE,
  TSCONFIG_INERTIA_TEMPLATE,
  patchNestCliJson,
  patchTsconfigExclude,
  runInit,
} from './init.js';

interface Check {
  name: string;
  pass: boolean;
  fix?: string | undefined;
  autoFix?: (() => void | Promise<void>) | undefined;
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

function writeJsonField(filePath: string, dotPath: string[], value: unknown): void {
  const raw = readFileSync(filePath, 'utf8');
  const stripped = raw.replace(/\/\/.*$/gm, '');
  const obj = JSON.parse(stripped) as Record<string, unknown>;
  let target = obj as Record<string, unknown>;
  for (let i = 0; i < dotPath.length - 1; i++) {
    const key = dotPath[i] as string;
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key] as Record<string, unknown>;
  }
  const lastKey = dotPath[dotPath.length - 1] as string;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof target[lastKey] === 'object' &&
    target[lastKey] !== null
  ) {
    target[lastKey] = {
      ...(target[lastKey] as Record<string, unknown>),
      ...(value as Record<string, unknown>),
    };
  } else {
    target[lastKey] = value;
  }
  writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function getPackageVersion(cwd: string, pkg: string): string | null {
  try {
    const pkgJson = readJson(join(cwd, 'node_modules', pkg, 'package.json'));
    return (pkgJson?.version as string) ?? null;
  } catch {
    return null;
  }
}

function detectPkgManager(cwd: string): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function runDoctor(opts: { cwd: string; fix?: boolean }): Promise<number> {
  const { cwd, fix = false } = opts;
  const checks: Check[] = [];
  const pm = detectPkgManager(cwd);

  // 1. Config file
  checks.push({
    name: 'nestjs-inertia.config.ts exists',
    pass: checkFileExists(cwd, 'nestjs-inertia.config.ts'),
    fix: 'Run: nestjs-inertia init',
    autoFix: () => runInit({ cwd }),
  });

  // 2. Shell template exists
  const shellExtensions = ['html', 'htm', 'hbs', 'ejs', 'pug', 'liquid'];
  const shellDirs = ['inertia', 'views'];
  let foundShellPath: string | null = null;
  let foundShellDir: string | null = null;
  for (const dir of shellDirs) {
    for (const ext of shellExtensions) {
      const candidates = [`${dir}/index.${ext}`, `${dir}/shell.${ext}`];
      for (const candidate of candidates) {
        if (checkFileExists(cwd, candidate)) {
          foundShellPath = candidate;
          foundShellDir = dir;
          break;
        }
      }
      if (foundShellPath) break;
    }
    if (foundShellPath) break;
  }
  checks.push({
    name: 'Shell template (rootView) exists',
    pass: !!foundShellPath,
    fix: 'Run: nestjs-inertia init (creates inertia/index.html)',
    autoFix: () => runInit({ cwd }),
  });

  // 3. nest-cli.json copies shell template to dist/
  if (foundShellDir) {
    const nestCliPath = join(cwd, 'nest-cli.json');
    const nestCli = readJson(nestCliPath);
    const compiler = (nestCli?.compilerOptions ?? {}) as Record<string, unknown>;
    const assets = (compiler.assets ?? []) as Array<string | Record<string, unknown>>;
    const hasCopy = assets.some((a) => {
      if (typeof a === 'string') return a.includes(foundShellDir!);
      return String(a.include ?? '').includes(foundShellDir!);
    });
    checks.push({
      name: `nest-cli.json copies ${foundShellDir}/ to dist/ (needed for Docker)`,
      pass: hasCopy,
      fix: `Add asset entry for ${foundShellDir}/ in nest-cli.json compilerOptions.assets`,
      autoFix: () => {
        patchNestCliJson(cwd, foundShellDir!);
      },
    });
  }

  // 4. Entry point exists at the correct path
  const entryExtensions = ['tsx', 'ts'];
  const correctEntryExists = entryExtensions.some((ext) =>
    checkFileExists(cwd, `inertia/app/client.${ext}`),
  );
  const legacyEntryExists = entryExtensions.some((ext) =>
    checkFileExists(cwd, `inertia/app.${ext}`),
  );
  checks.push({
    name: 'Entry point at inertia/app/client.tsx (matches Vite plugin default)',
    pass: correctEntryExists,
    fix: legacyEntryExists
      ? 'Move inertia/app.tsx → inertia/app/client.tsx (the Vite plugin resolves inertia/app/client.tsx by default)'
      : 'Run: nestjs-inertia init',
    autoFix: !correctEntryExists ? () => runInit({ cwd }) : undefined,
  });

  // 5. Codegen output
  const hasApi = checkFileExists(cwd, '.nestjs-inertia/api.ts');
  const hasRoutes = checkFileExists(cwd, '.nestjs-inertia/routes.ts');
  const hasPages = checkFileExists(cwd, '.nestjs-inertia/pages.d.ts');
  checks.push({
    name: '.nestjs-inertia/ codegen output exists',
    pass: hasApi && hasRoutes && hasPages,
    fix: 'Run: nestjs-inertia codegen',
    autoFix: () => runCodegen({ cwd }),
  });

  // 5. tsconfig paths
  const tsconfigPath = join(cwd, 'tsconfig.json');
  const tsconfig = readJson(tsconfigPath);
  const paths = (tsconfig?.compilerOptions as Record<string, unknown>)?.paths as
    | Record<string, string[]>
    | undefined;
  checks.push({
    name: 'tsconfig.json has @/* path alias',
    pass: !!paths?.['@/*'],
    fix: 'Add @/* path alias to tsconfig.json',
    autoFix: () =>
      writeJsonField(tsconfigPath, ['compilerOptions', 'paths'], { '@/*': ['./src/*'] }),
  });

  // 6. tsconfig.json and tsconfig.build.json exclude inertia/ from server build
  const inertiaDir = foundShellDir ?? 'inertia';
  for (const tsconfigFile of ['tsconfig.json', 'tsconfig.build.json']) {
    const tsc = readJson(join(cwd, tsconfigFile));
    if (!tsc) continue; // file doesn't exist, skip
    const excl = (tsc.exclude ?? []) as string[];
    const excludesIt = excl.includes(inertiaDir);
    checks.push({
      name: `${tsconfigFile} excludes ${inertiaDir}/ from server compilation`,
      pass: excludesIt,
      fix: `Add "${inertiaDir}" to ${tsconfigFile} exclude array (Vite-only APIs like import.meta.glob break nest build)`,
      autoFix: () => {
        patchTsconfigExclude(cwd, inertiaDir, tsconfigFile);
      },
    });
  }

  // 7. Root tsconfig.json excludes `dist` so the server typecheck doesn't
  // walk compiled artifacts under dist/inertia/* (would surface ~thousands
  // of phantom errors about unresolved aliases in the compiled tree).
  {
    const tsc = readJson(tsconfigPath);
    const excl = (tsc?.exclude ?? []) as string[];
    const excludesDist = excl.includes('dist');
    checks.push({
      name: 'tsconfig.json excludes dist/ (avoids phantom errors in compiled output)',
      pass: excludesDist,
      fix: 'Add "dist" to tsconfig.json exclude array',
      autoFix: () => {
        patchTsconfigExclude(cwd, 'dist', 'tsconfig.json');
      },
    });
  }

  // 8. Dedicated inertia tsconfig — required so the inertia/ tree + codegen
  // output can be typechecked without breaking the server tsconfig.
  const inertiaTsconfigPath = join(cwd, 'tsconfig.inertia.json');
  const inertiaTsconfig = readJson(inertiaTsconfigPath);
  checks.push({
    name: 'tsconfig.inertia.json exists',
    pass: !!inertiaTsconfig,
    fix: 'Create tsconfig.inertia.json (typechecks inertia/ + .nestjs-inertia/)',
    autoFix: () => {
      writeFileSync(inertiaTsconfigPath, TSCONFIG_INERTIA_TEMPLATE, 'utf8');
    },
  });

  if (inertiaTsconfig) {
    const inertiaOpts = (inertiaTsconfig.compilerOptions as Record<string, unknown>) ?? {};
    const inertiaPaths = (inertiaOpts.paths as Record<string, string[]> | undefined) ?? {};
    const at = inertiaPaths['@/*'] ?? [];
    const missingTilde = !inertiaPaths['~/*'];
    const missingCodegen = !inertiaPaths['~codegen/*'];
    const missingDualAt = !at.includes('./inertia/*') || !at.includes('./src/*');
    checks.push({
      name: 'tsconfig.inertia.json has ~/*, ~codegen/*, and @/* (inertia + src) aliases',
      pass: !missingTilde && !missingCodegen && !missingDualAt,
      fix: '@/* must include both ./inertia/* and ./src/* so codegen-resolved controllers + inertia user code both resolve',
      autoFix: () => {
        const additions: Record<string, string[]> = {};
        if (missingDualAt) additions['@/*'] = ['./inertia/*', './src/*'];
        if (missingTilde) additions['~/*'] = ['./inertia/*'];
        if (missingCodegen) additions['~codegen/*'] = ['./.nestjs-inertia/*'];
        writeJsonField(inertiaTsconfigPath, ['compilerOptions', 'paths'], additions);
      },
    });
    // experimentalDecorators is required: codegen api.ts imports controllers
    // (via Awaited<ReturnType<...>>) which TS has to parse for decorators.
    checks.push({
      name: 'tsconfig.inertia.json has experimentalDecorators: true',
      pass: inertiaOpts.experimentalDecorators === true,
      fix: 'Set compilerOptions.experimentalDecorators = true',
      autoFix: () => {
        writeJsonField(inertiaTsconfigPath, ['compilerOptions', 'experimentalDecorators'], true);
      },
    });
    // Without emitDecoratorMetadata: OFF, every src/ file pulled in
    // transitively complains with TS1272 unless it uses `import type`.
    checks.push({
      name: 'tsconfig.inertia.json has emitDecoratorMetadata: false',
      pass: inertiaOpts.emitDecoratorMetadata === false,
      fix: 'Set compilerOptions.emitDecoratorMetadata = false (avoids TS1272 spam from transitively-loaded src/ files)',
      autoFix: () => {
        writeJsonField(inertiaTsconfigPath, ['compilerOptions', 'emitDecoratorMetadata'], false);
      },
    });
    // Must include nestjs-inertia.d.ts so the InertiaRegistry augmentation
    // resolves Link route params, page names, and shared props.
    const include = (inertiaTsconfig.include as string[] | undefined) ?? [];
    checks.push({
      name: 'tsconfig.inertia.json includes nestjs-inertia.d.ts',
      pass: include.some((p) => p.includes('nestjs-inertia.d.ts')),
      fix: 'Add "nestjs-inertia.d.ts" to include array (resolves InertiaRegistry augmentation)',
    });
  }

  // 9. inertia/tsconfig.json — thin extends so VSCode/editors that walk up
  // to find the closest tsconfig pick up the inertia-aware aliases.
  const innerTsconfigPath = join(cwd, 'inertia', 'tsconfig.json');
  checks.push({
    name: 'inertia/tsconfig.json exists (VSCode picks up ~codegen alias)',
    pass: existsSync(innerTsconfigPath),
    fix: 'Create inertia/tsconfig.json that extends ../tsconfig.inertia.json',
    autoFix: () => {
      writeFileSync(innerTsconfigPath, INERTIA_TSCONFIG_TEMPLATE, 'utf8');
    },
  });

  // 7. Vite config
  if (checkFileExists(cwd, 'vite.config.ts')) {
    const viteContent = readFileSync(join(cwd, 'vite.config.ts'), 'utf8');
    checks.push({
      name: 'vite.config.ts has resolve.alias',
      pass: viteContent.includes('resolve') && viteContent.includes('alias'),
      fix: 'Add resolve.alias to vite.config.ts (manual — complex file)',
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

  // 8. Package versions
  const requiredPkgs = [
    '@dudousxd/nestjs-inertia',
    '@dudousxd/nestjs-inertia-codegen',
    '@dudousxd/nestjs-inertia-client',
  ];
  const missingRequired = requiredPkgs.filter((pkg) => !getPackageVersion(cwd, pkg));
  checks.push({
    name: 'Core packages installed (core + codegen + client)',
    pass: missingRequired.length === 0,
    fix: `Missing: ${missingRequired.join(', ')}`,
    autoFix:
      missingRequired.length > 0
        ? () => {
            const addCmd = pm === 'npm' ? 'install' : 'add';
            execFileSync(pm, [addCmd, ...missingRequired], { cwd, stdio: 'inherit' });
          }
        : undefined,
  });

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
  if (installed.length > 1) {
    checks.push({
      name: 'All packages on same version',
      pass: uniqueVersions.size === 1,
      fix: `Versions: ${installed.map((v) => `${v.pkg.replace('@dudousxd/', '')}@${v.version}`).join(', ')}`,
    });
  }

  // 9. Inertia.js version
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
      fix: `Current: v${inertiaVersion}`,
      autoFix:
        majorVersion < 3
          ? () => {
              const addCmd = pm === 'npm' ? 'install' : 'add';
              execFileSync(pm, [addCmd, `@inertiajs/${inertiaFramework}@^3.0.0`], {
                cwd,
                stdio: 'inherit',
              });
            }
          : undefined,
    });
  }

  // 10. .gitignore
  if (checkFileExists(cwd, '.gitignore')) {
    const gitignorePath = join(cwd, '.gitignore');
    const gitignore = readFileSync(gitignorePath, 'utf8');
    checks.push({
      name: '.gitignore includes .nestjs-inertia/',
      pass: gitignore.includes('.nestjs-inertia'),
      fix: 'Add .nestjs-inertia/ to .gitignore',
      autoFix: () => appendFileSync(gitignorePath, '\n.nestjs-inertia/\n'),
    });
  }

  // 11. Build scripts
  const pkgJsonPath = join(cwd, 'package.json');
  const pkgJson = readJson(pkgJsonPath);
  const scripts = (pkgJson?.scripts as Record<string, string>) ?? {};
  checks.push({
    name: 'package.json has build:client script',
    pass: !!scripts['build:client'],
    fix: 'Add build:client script',
    autoFix: () => writeJsonField(pkgJsonPath, ['scripts'], { 'build:client': 'vite build' }),
  });
  checks.push({
    name: 'package.json has typecheck:inertia script',
    pass: !!scripts['typecheck:inertia'],
    fix: 'Add: "typecheck:inertia": "tsc --noEmit -p tsconfig.inertia.json"',
    autoFix: () =>
      writeJsonField(pkgJsonPath, ['scripts'], {
        'typecheck:inertia': 'tsc --noEmit -p tsconfig.inertia.json',
      }),
  });

  // Print results + auto-fix
  console.log('');
  console.log(`\x1b[1mnestjs-inertia doctor${fix ? ' --fix' : ''}\x1b[0m`);
  console.log('');

  let hasFailures = false;
  let fixed = 0;

  for (const check of checks) {
    if (check.pass) {
      console.log(`  \x1b[32m✓\x1b[0m ${check.name}`);
      continue;
    }

    if (fix && check.autoFix) {
      try {
        check.autoFix();
        console.log(`  \x1b[34m⚡\x1b[0m ${check.name} \x1b[34m(fixed)\x1b[0m`);
        fixed++;
        continue;
      } catch (err) {
        console.log(`  \x1b[31m✗\x1b[0m ${check.name} \x1b[31m(auto-fix failed)\x1b[0m`);
        if (check.fix) console.log(`    \x1b[2m${check.fix}\x1b[0m`);
        hasFailures = true;
        continue;
      }
    }

    console.log(`  \x1b[31m✗\x1b[0m ${check.name}`);
    if (check.fix) {
      const hint = check.autoFix ? `${check.fix} (fixable with --fix)` : check.fix;
      console.log(`    \x1b[2m${hint}\x1b[0m`);
    }
    hasFailures = true;
  }

  console.log('');
  const failCount = checks.filter((c) => !c.pass).length - fixed;
  if (fixed > 0) console.log(`\x1b[34m${fixed} issue(s) auto-fixed\x1b[0m`);
  if (failCount > 0) {
    console.log(`\x1b[33m${failCount} issue(s) remaining\x1b[0m`);
  } else if (!hasFailures) {
    console.log('\x1b[32mAll checks passed!\x1b[0m');
  }
  console.log('');

  return hasFailures ? 1 : 0;
}
