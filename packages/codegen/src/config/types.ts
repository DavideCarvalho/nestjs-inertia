export interface UserConfig {
  pages: {
    glob: string;
    propsExport?: string;
    componentNameStrategy?: 'relative-no-ext' | 'kebab' | ((path: string) => string);
  };
  contracts?: {
    /** Glob pattern (relative to cwd) for controller files. Default: `'src/**\/\*.controller.ts'` */
    glob?: string;
    /** Debounce delay in ms before re-running route discovery. Default: `500` */
    debounceMs?: number;
  };
  scopes?: Record<string, ScopeConfig>;
  codegen?: {
    outDir?: string;
    cwd?: string;
  };
  app?: {
    moduleEntry: string;
    tsconfig?: string;
  } | null;
  /**
   * Custom fetcher configuration. When `importPath` is set, the codegen
   * imports `fetcher` from that path instead of generating `createFetcher()`.
   * This lets users configure baseUrl, headers, plugins (e.g. superjson).
   *
   * @example
   * // nestjs-inertia.config.ts
   * fetcher: { importPath: '~/lib/api' }
   *
   * // inertia/lib/api.ts
   * import { createFetcher } from '@dudousxd/nestjs-inertia-client';
   * export const fetcher = createFetcher({ baseUrl: '/api' });
   */
  fetcher?: {
    importPath: string;
  };
}

export interface ScopeConfig {
  glob: string;
  prefix?: string;
}

export interface ResolvedPagesConfig {
  glob: string;
  propsExport: string;
  componentNameStrategy: 'relative-no-ext' | 'kebab' | ((path: string) => string);
}

export interface ResolvedContractsConfig {
  /** Glob pattern relative to `codegen.cwd` for watching controller files. */
  glob: string;
  /** Debounce delay in ms before re-running route discovery. */
  debounceMs: number;
}

export interface ResolvedCodegenConfig {
  outDir: string;
  cwd: string;
}

export interface ResolvedAppConfig {
  moduleEntry: string;
  tsconfig: string | null;
}

export interface ResolvedConfig {
  pages: ResolvedPagesConfig;
  contracts: ResolvedContractsConfig;
  scopes: Record<string, ScopeConfig>;
  codegen: ResolvedCodegenConfig;
  app: ResolvedAppConfig | null;
  fetcher: { importPath: string } | null;
}
