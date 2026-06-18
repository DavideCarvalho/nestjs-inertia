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
  matchPropsOn?: Record<string, string | string[]>;
}

export interface SsrResult {
  head: string[];
  body: string;
}

/**
 * Minimal writable sink that a streaming SSR bundle pipes its app HTML into.
 * Intentionally narrow so the loader/service stay agnostic of the concrete
 * HTTP framework (Express `res`, Fastify `reply.raw`, or a test double all
 * satisfy this). Mirrors the relevant surface of `node:stream.Writable`.
 */
export interface SsrWritable {
  write(chunk: string | Uint8Array): boolean;
  end(chunk?: string | Uint8Array): void;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * The object a streaming SSR bundle returns from `renderToStream(page)`.
 *
 * This is the minimal optional streaming contract a bundle may implement (in
 * addition to, or instead of, `render(page)`). It is shaped to map cleanly onto
 * React 18's `renderToPipeableStream` (which yields `{ pipe(writable) }`):
 *
 * - `head`  — head fragments to flush BEFORE the app body (same role as
 *             `SsrResult.head`). Optional; defaults to `[]`.
 * - `pipe`  — writes the app HTML into `writable` progressively. The adapter
 *             owns `writable.end()` of the *response*, so a bundle's `pipe`
 *             should NOT end the response; if it ends its own intermediate
 *             stream that is fine. React's `renderToPipeableStream().pipe(dest)`
 *             both writes and ends `dest`, so bundles wrapping React should pipe
 *             into a pass-through and let the adapter append the shell tail.
 */
export interface SsrStreamResult {
  head?: string[];
  pipe(writable: SsrWritable): void;
}

/**
 * Retry policy for the SSR bundle loader. A transient load failure (e.g. the
 * bundle is not on disk yet at boot) is retried on later requests instead of
 * disabling SSR for the whole process. After `maxRetries` consecutive failures
 * the loader cools down for `cooldownMs`, then becomes eligible to retry again.
 */
export interface SsrRetryOptions {
  /** Additional attempts after the first, before entering cooldown. Default `3`. */
  maxRetries?: number;
  /** Cooldown (ms) after retries are exhausted before retrying again. Default `30000`. */
  cooldownMs?: number;
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
  /**
   * Opt into progressive SSR streaming. When `true` AND the loaded bundle
   * exports a streaming entry (`renderToStream`), the HTML (non-XHR) response is
   * streamed: shell head → app body (piped) → shell tail, improving TTFB.
   * Falls back to the buffered `render()` path when the bundle has no streaming
   * entry. Default `false` (backward-compatible).
   */
  streaming?: boolean;
  /** Retry policy for transient bundle-load failures. See {@link SsrRetryOptions}. */
  retry?: SsrRetryOptions;
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
}

/**
 * Options controlling the {@link InertiaValidationFilter}, which auto-flashes a
 * field-keyed error bag and 303-redirects back when validation fails on an
 * Inertia non-GET request.
 */
export interface InertiaValidationOptions {
  /** Enable the validation filter. Default `false` (additive / non-breaking). */
  enabled?: boolean;
  /** Redirect-back target when no `Referer` is present. Default `'/'`. */
  fallbackRedirect?: string;
  /** How to combine multiple messages for the same field key. Default `'first'`. */
  mergeMessages?: 'first' | 'join';
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
  /** Hard-disable diagnostics_channel publishing even when a subscriber exists.
   *  Default true. Set false to guarantee no publish in hardened prod. */
  diagnostics?: boolean;
  validation?: InertiaValidationOptions;
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
