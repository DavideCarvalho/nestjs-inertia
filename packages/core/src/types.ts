import type { FlashStore } from './flash/flash-store.js';
import type { InertiaScope } from './tokens.js';

export interface PageObject {
  component: string;
  props: Record<string, unknown>;
  url: string;
  version: string;
  encryptHistory?: boolean;
  clearHistory?: boolean;
  deferredProps?: Record<string, string[]>;
  mergeProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: Record<string, string>;
}

export interface SsrResult {
  head: string[];
  body: string;
}

export type Props = Record<string, unknown>;

export type SharedFactory = (req: unknown) => Props | Promise<Props>;
export type SharedInput = Props | SharedFactory;

export interface ShellRenderCtx {
  page: PageObject;
  ssr: SsrResult | null;
  manifest: unknown;
  assetVersion: string;
  ctx: { req: unknown; res: unknown };
}

export type RootViewFn = (ctx: ShellRenderCtx) => string | Promise<string>;
export type RootView = string | RootViewFn;

export interface ViteOptions {
  entry: string;
  manifestPath?: string;
  hmrPort?: number;
}

export interface SsrOptions {
  enabled?: boolean;
  bundlePath?: string;
  devMode?: 'off' | 'vite';
  throwOnError?: boolean;
}

/**
 * Options controlling the auto-bootstrap of the `@dudousxd/nestjs-inertia-codegen` file watcher
 * that is started automatically inside `InertiaModule.onApplicationBootstrap` in dev mode.
 *
 * @example
 * // Disable auto-watch entirely (e.g. in CI or when running the CLI watcher manually):
 * InertiaModule.forRoot({ codegen: { enabled: false } })
 */
export interface CodegenOptions {
  /**
   * Whether to auto-start the codegen watcher when the application bootstraps.
   *
   * - `'auto'` (default) — start when `NODE_ENV !== 'production'` AND the
   *   `@dudousxd/nestjs-inertia-codegen` package is installed AND a
   *   `nestjs-inertia.config.ts` config file is present.
   * - `true` — same as `'auto'`.
   * - `false` — never auto-start; useful when running the CLI watcher (`nestjs-inertia codegen --watch`)
   *   in a separate terminal or when you want to disable codegen entirely.
   */
  enabled?: boolean | 'auto';
  /** Path to the codegen config file, relative to `process.cwd()`. Defaults to `nestjs-inertia.config.ts`. */
  configFile?: string;
  /** Debounce delay (ms) applied to the contracts watcher. Defaults to 500. */
  debounceMs?: number;
}

export interface InertiaModuleOptions {
  rootView?: RootView;
  vite?: ViteOptions;
  ssr?: SsrOptions;
  share?: SharedInput;
  version?: string | (() => string | Promise<string>);
  historyEncryption?: { default?: boolean };
  autoUpgrade303?: boolean;
  methodSpoofing?: boolean;
  codegen?: CodegenOptions;
  flashStore?: FlashStore;
}

export interface InertiaFeatureOptions extends InertiaModuleOptions {
  scope: InertiaScope;
}

export interface InertiaOptionsFactory {
  createInertiaOptions(): Promise<InertiaModuleOptions> | InertiaModuleOptions;
}

export interface InertiaFeatureAsyncOptions {
  scope: string;
  imports?: unknown[];
  inject?: unknown[];
  useExisting?: new (...args: unknown[]) => InertiaOptionsFactory;
  useClass?: new (...args: unknown[]) => InertiaOptionsFactory;
  useFactory?: (...args: unknown[]) => Promise<InertiaModuleOptions> | InertiaModuleOptions;
}

export interface InertiaModuleAsyncOptions {
  imports?: unknown[];
  inject?: unknown[];
  useExisting?: new (...args: unknown[]) => InertiaOptionsFactory;
  useClass?: new (...args: unknown[]) => InertiaOptionsFactory;
  useFactory?: (...args: unknown[]) => Promise<InertiaModuleOptions> | InertiaModuleOptions;
}
