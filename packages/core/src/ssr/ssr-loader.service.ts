import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions, PageObject, SsrStreamResult } from '../types.js';

export interface SsrModule {
  /** Buffered render: returns the full head + body string at once. */
  render(page: PageObject): Promise<{ head: string[]; body: string }>;
  /**
   * Optional streaming entry. When present (and `ssr.streaming` is enabled), the
   * service streams the app HTML into the response instead of buffering it.
   * Bundle-agnostic: the bundle decides how it produces the stream (e.g. React
   * 18 `renderToPipeableStream`).
   */
  renderToStream?: (page: PageObject) => SsrStreamResult | Promise<SsrStreamResult>;
}

/** Raw module namespace shape we probe after import. */
interface SsrModuleNamespace {
  default?: Partial<SsrModule>;
  render?: SsrModule['render'];
  renderToStream?: SsrModule['renderToStream'];
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

/** Returns true when running inside vitest. */
function isVitest(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

/**
 * Loads the external SSR bundle and exposes its buffered (`render`) and optional
 * streaming (`renderToStream`) entries.
 *
 * Resilience: a transient load failure (bundle not on disk yet, partial write,
 * etc.) no longer disables SSR for the whole process. Each failed `load()`
 * increments an attempt counter; once `maxRetries` consecutive attempts have
 * failed the loader cools down for `cooldownMs` (returning `null` / CSR
 * fallback without re-attempting), then becomes eligible to retry again. A
 * successful load is cached and stops all retrying. `reset()` clears the latch
 * immediately.
 */
@Injectable()
export class SsrLoaderService {
  private readonly logger = new Logger(SsrLoaderService.name);
  private cached: SsrModule | null = null;

  /** Consecutive failed attempts since the last success/reset. @internal (test seam) */
  _attempts = 0;
  /** Timestamp (ms) of the most recent failed attempt. @internal (test seam) */
  _lastAttemptAt = 0;

  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly opts: InertiaModuleOptions) {}

  /** Clears the failure latch so the next `load()` re-attempts immediately. */
  reset(): void {
    this._attempts = 0;
    this._lastAttemptAt = 0;
  }

  async load(): Promise<SsrModule | null> {
    if (!this.opts.ssr?.enabled) return null;
    if (this.cached) return this.cached;

    const maxRetries = this.opts.ssr.retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const cooldownMs = this.opts.ssr.retry?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

    // Retries exhausted: stay in cooldown (return null) until the window elapses,
    // then reset so a fresh batch of attempts can run.
    if (this._attempts > maxRetries) {
      if (Date.now() - this._lastAttemptAt < cooldownMs) return null;
      this.reset();
    }

    try {
      const mod = await this.loadModule();
      const resolved = this.resolveExports(mod);
      if (resolved === null) {
        // Missing-exports is a "hard" config error, not a transient one: count it
        // as a normal failed attempt so it still benefits from retry/cooldown.
        return this.fail(new Error('SSR bundle exports neither default nor render()'));
      }
      this.cached = resolved;
      this.reset();
      return this.cached;
    } catch (err) {
      return this.fail(err as Error);
    }
  }

  private fail(err: Error): null {
    if (this.opts.ssr?.throwOnError) throw err;
    this._attempts += 1;
    this._lastAttemptAt = Date.now();
    const willRetry = this._attempts <= (this.opts.ssr?.retry?.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.logger.warn(
      `SSR bundle not loaded, falling back to CSR (attempt ${this._attempts}${
        willRetry ? ', will retry' : ', cooling down'
      }): ${err.message}`,
    );
    return null;
  }

  private async loadModule(): Promise<SsrModuleNamespace> {
    const bundlePath = resolve(
      process.cwd(),
      this.opts.ssr?.bundlePath ?? 'dist/inertia/ssr/ssr.mjs',
    );

    if (isVitest()) {
      // vitest 3's vite-node intercepts `await import(filePath)` even with
      // @vite-ignore, masking real fs errors with "Cannot find module imported
      // from <source>". Read the bundle off disk and import via a data: URL —
      // the module is inlined so the resolver has nothing to look up.
      // The bundle is loaded once then cached on `this.cached`, so the readFile
      // cost is one-shot.
      const code = readFileSync(bundlePath, 'utf8');
      const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
      return (await import(/* @vite-ignore */ dataUrl)) as SsrModuleNamespace;
    }

    // Production / non-vitest: use a file:// URL so Node resolves the bundle
    // path directly without going through any bundler resolver.
    const fileUrl = pathToFileURL(bundlePath).href;
    return (await import(/* @vite-ignore */ fileUrl)) as SsrModuleNamespace;
  }

  /**
   * Normalize the bundle's exports into an {@link SsrModule}, accepting either a
   * default export object or top-level named exports. Returns `null` when no
   * usable `render` is found.
   */
  private resolveExports(mod: SsrModuleNamespace): SsrModule | null {
    const def = mod.default;
    let render: SsrModule['render'] | undefined;
    let renderToStream: SsrModule['renderToStream'] | undefined;

    if (def && typeof def.render === 'function') {
      render = def.render;
      if (typeof def.renderToStream === 'function') renderToStream = def.renderToStream;
    } else if (typeof mod.render === 'function') {
      render = mod.render;
    }

    // Top-level named streaming export takes effect when no default-export stream
    // was found (named exports are the idiomatic shape for non-default bundles).
    if (!renderToStream && typeof mod.renderToStream === 'function') {
      renderToStream = mod.renderToStream;
    }

    if (!render) return null;
    return renderToStream ? { render, renderToStream } : { render };
  }
}
