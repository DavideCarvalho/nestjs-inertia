import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { InertiaRequest } from '../adapter/adapter.js';
import { resolvePlatformAdapter } from '../adapter/resolve-adapter.js';
import type { FlashErrors } from '../flash/flash-store.js';
import { validateLocationUrl } from '../helpers/validate-location-url.js';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';
import { extractFieldErrors } from './extract-field-errors.js';

/**
 * Catches validation `BadRequestException`s on Inertia non-GET requests,
 * flashes a field-keyed error bag via the configured `flashStore`, and
 * 303-redirects back to the originating page. The GET-side read in
 * `InertiaService.render()` then surfaces the errors as `props.errors`.
 *
 * Only activates for Inertia requests (`X-Inertia` header) on non-GET methods,
 * and only for recognized validation failures. Everything else is delegated to
 * Nest's `BaseExceptionFilter`, which writes the normal JSON 400 — preserving
 * API clients.
 *
 * Never rethrows: Nest's `ExceptionsHandler` invokes `filter.catch()` without
 * awaiting it, so an exception thrown from (or a rejection returned by) a
 * filter is not routed anywhere — it becomes an unhandled rejection that can
 * crash the process and leaves the request hanging. Every path here therefore
 * writes a response itself.
 */
@Catch(BadRequestException)
export class InertiaValidationFilter implements ExceptionFilter {
  constructor(
    @Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> | void {
    const http = host.switchToHttp();
    // Normalize req/res through the platform adapter rather than duck-typing
    // Express vs Fastify inline — the cross-runtime concern lives in adapter/.
    const adapter = resolvePlatformAdapter(this.httpAdapterHost);
    const req = adapter.adaptRequest(http.getRequest<unknown>());
    const rawRes = http.getResponse<unknown>();

    // Disabled (default): defer to Nest's default handling. The filter is
    // registered unconditionally but stays inert unless opted in.
    if (!this.options.validation?.enabled) {
      return this.defaultHandling(exception, host);
    }

    const method = req.method;

    // Gate: only Inertia non-GET requests. Else default handling (JSON 400).
    if (!req.header('X-Inertia') || method === 'GET' || method === undefined) {
      return this.defaultHandling(exception, host);
    }

    const errors = extractFieldErrors(exception, {
      mergeMessages: this.options.validation?.mergeMessages ?? 'first',
    });
    if (errors === null) {
      return this.defaultHandling(exception, host);
    }

    // Error-bag scoping (symmetric with ErrorBagInterceptor on the happy path).
    // The bag wrapper nests one level deeper; `FlashErrors` is recursive so this
    // is representable directly (no cast). The read side passes it through
    // untouched.
    const bag = req.header('X-Inertia-Error-Bag');
    const scoped: FlashErrors = bag ? { [bag]: errors } : errors;
    const target = this.resolveRedirectTarget(req);
    const redirect = (): void => {
      adapter.adaptResponse(rawRes).status(303).setHeader('Location', target).end();
    };

    // flashStore presence is guaranteed by the bootstrap check in module.ts.
    // Write against the underlying framework request: Fastify exposes the Node
    // req as `.raw`; Express is the request itself.
    const flashStore = this.options.flashStore;
    if (!flashStore?.write) {
      redirect();
      return;
    }

    let written: void | Promise<void>;
    try {
      const frameworkReq = req.raw as { raw?: unknown };
      written = flashStore.write(frameworkReq.raw ?? frameworkReq, scoped);
    } catch (err) {
      // Sync write failure: answer with Nest's default (500, logged).
      return this.defaultHandling(err, host);
    }
    if (!isPromiseLike(written)) {
      redirect();
      return;
    }
    // Async write: the returned promise must never reject (Nest drops it), so
    // a failed write is answered here with Nest's default 500 instead.
    return Promise.resolve(written)
      .then(redirect)
      .catch((err: unknown) => this.defaultHandling(err, host));
  }

  /**
   * Writes Nest's default response for `exception` (JSON 400 for the
   * passthrough cases; logged 500 for a non-HTTP error such as a failed flash
   * write). The adapter is resolved at catch time: under `Test.compile()` the
   * filter is instantiated before the HTTP adapter is attached to the host.
   */
  private defaultHandling(exception: unknown, host: ArgumentsHost): void {
    new BaseExceptionFilter(this.httpAdapterHost.httpAdapter).catch(exception, host);
  }

  private resolveRedirectTarget(req: InertiaRequest): string {
    const fallback = this.options.validation?.fallbackRedirect ?? '/';
    const candidate = req.header('X-Inertia-Referer') ?? req.header('Referer') ?? fallback;
    const host = req.header('Host');
    return toSafeSameOriginPath(candidate, host, fallback);
  }
}

/**
 * Reduces a candidate redirect URL to a safe same-origin path+query, falling
 * back when the candidate is cross-origin or otherwise unsafe (open-redirect
 * guard). Absolute same-origin URLs are stripped to their path+query first so
 * the `validateLocationUrl` guard (which rejects all absolute URLs server-side)
 * accepts them; absolute URLs to a different host are rejected.
 */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function toSafeSameOriginPath(
  candidate: string,
  host: string | undefined,
  fallback: string,
): string {
  let value = candidate;
  // Strip absolute URLs to their path+query (Referer is usually absolute).
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    // Cross-origin guard: only same-host Referers are trusted. Without a Host
    // header we cannot establish same-origin, so reject any absolute URL.
    if (!host || parsed.host !== host) {
      return fallback;
    }
    value = `${parsed.pathname}${parsed.search}`;
  } catch {
    // Not an absolute URL — keep as-is and let validateLocationUrl decide.
  }
  try {
    return validateLocationUrl(value);
  } catch {
    return fallback;
  }
}
