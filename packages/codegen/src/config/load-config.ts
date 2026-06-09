import { access } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from '../exceptions.js';
import type { ResolvedConfig, UserConfig } from './types.js';

const CONFIG_FILE = 'nestjs-inertia.config.ts';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function importTs(filePath: string): Promise<unknown> {
  // Use tsx ESM API to load TypeScript config files at runtime
  let tsImport:
    | ((specifier: string, options: string | { parentURL: string }) => Promise<unknown>)
    | undefined;
  try {
    const tsxEsm = await import('tsx/esm/api');
    tsImport = tsxEsm.tsImport;
  } catch {
    throw new ConfigError(
      'Failed to load config: `tsx` is required for loading TypeScript config files. ' +
        'Install it as a dev dependency: pnpm add -D tsx',
    );
  }

  const parentURL = pathToFileURL(`${filePath}__parent__`).href;
  const fileUrl = pathToFileURL(filePath).href;
  return tsImport(fileUrl, { parentURL });
}

function resolveAbsolute(cwd: string, p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(cwd, p);
}

/**
 * Validates that `resolvedPath` is contained inside `cwd`.
 * Throws `ConfigError` if the path escapes the project root (e.g. via `..`
 * traversal or an absolute path outside cwd).
 */
function assertInsideCwd(cwd: string, resolvedPath: string, fieldName: string): void {
  const rel = relative(cwd, resolvedPath);
  // relative() returns a path starting with '..' when the target is outside cwd,
  // and isAbsolute() catches platform edge-cases (e.g. Windows drive letters).
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new ConfigError(
      `\`${fieldName}\` must be inside the project cwd.\n  Resolved to: ${resolvedPath}\n  Project cwd: ${cwd}\nIf this is intentional, move the file inside your project directory.`,
    );
  }
}

function applyDefaults(userConfig: UserConfig, cwd: string): ResolvedConfig {
  const outDir = userConfig.codegen?.outDir
    ? resolveAbsolute(cwd, userConfig.codegen.outDir)
    : join(cwd, '.nestjs-inertia');

  const resolvedCwd = userConfig.codegen?.cwd ? resolveAbsolute(cwd, userConfig.codegen.cwd) : cwd;

  let app: ResolvedConfig['app'] = null;
  if (userConfig.app) {
    const resolvedEntry = resolveAbsolute(cwd, userConfig.app.moduleEntry);
    assertInsideCwd(cwd, resolvedEntry, 'app.moduleEntry');

    let resolvedTsconfig: string | null = null;
    if (userConfig.app.tsconfig) {
      resolvedTsconfig = resolveAbsolute(cwd, userConfig.app.tsconfig);
      assertInsideCwd(cwd, resolvedTsconfig, 'app.tsconfig');
    }

    app = {
      moduleEntry: resolvedEntry,
      tsconfig: resolvedTsconfig,
    };
  }

  return {
    pages: {
      glob: userConfig.pages.glob,
      propsExport: userConfig.pages.propsExport ?? 'ComponentProps',
      componentNameStrategy: userConfig.pages.componentNameStrategy ?? 'relative-no-ext',
    },
    contracts: {
      glob: userConfig.contracts?.glob ?? 'src/**/*.controller.ts',
      debounceMs: userConfig.contracts?.debounceMs ?? 500,
    },
    scopes: userConfig.scopes ?? {},
    codegen: {
      outDir,
      cwd: resolvedCwd,
    },
    app,
    fetcher: userConfig.fetcher ?? null,
    forms: {
      enabled: userConfig.forms?.enabled ?? true,
      watch: userConfig.forms?.watch ?? 'src/**/*.dto.ts',
      zodImport: userConfig.forms?.zodImport ?? 'zod',
    },
  };
}

export async function loadConfig(cwd?: string): Promise<ResolvedConfig> {
  const resolvedCwd = cwd ?? process.cwd();
  const configPath = join(resolvedCwd, CONFIG_FILE);

  if (!(await fileExists(configPath))) {
    throw new ConfigError(
      `Config file not found: ${configPath}\nRun \`nestjs-inertia init\` to create a starter config.`,
    );
  }

  let mod: unknown;
  try {
    mod = await importTs(configPath);
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Failed to load config from ${configPath}`, { cause: err });
  }

  // tsImport returns a namespace module where `mod.default` is the module namespace object.
  // The actual `export default` value lives at `mod.default.default` (or `mod.default` for CJS interop).
  const modNs = (mod as Record<string, unknown>).default;
  const userConfig =
    modNs != null && typeof modNs === 'object' && 'default' in (modNs as object)
      ? ((modNs as Record<string, unknown>).default as UserConfig)
      : (modNs as UserConfig | undefined);

  if (!userConfig || typeof userConfig !== 'object') {
    throw new ConfigError(
      `Config file must have a default export. Did you forget \`export default defineConfig({...})\`? (${configPath})`,
    );
  }

  if (!userConfig.pages || typeof userConfig.pages.glob !== 'string') {
    throw new ConfigError(`Config validation failed: \`pages.glob\` is required (${configPath})`);
  }

  return applyDefaults(userConfig, resolvedCwd);
}
