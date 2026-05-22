import type { InertiaScope } from './tokens.js';
import type { FlashStore } from './flash/flash-store.js';

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

export interface CodegenOptions {
  enabled?: boolean | 'auto';
  configFile?: string;
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
