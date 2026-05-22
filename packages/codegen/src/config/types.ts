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
    /**
     * Use static AST-based discovery (ts-morph) instead of bootstrapping a NestJS app.
     * Defaults to `true` in watch mode for faster hot-reload. Set to `false` to always
     * use the heavy probe path.
     */
    useStaticDiscovery?: boolean;
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
  /**
   * When true (default), use static AST-based discovery via ts-morph instead of bootstrapping
   * a full NestJS app. Significantly faster (~100-500 ms vs 2-10 s). Set to `false` to always
   * use the heavy probe path.
   */
  useStaticDiscovery: boolean;
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
}
