export interface UserConfig {
  pages: {
    glob: string;
    propsExport?: string;
    componentNameStrategy?: 'relative-no-ext' | 'kebab' | ((path: string) => string);
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
  scopes: Record<string, ScopeConfig>;
  codegen: ResolvedCodegenConfig;
  app: ResolvedAppConfig | null;
}
