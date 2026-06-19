import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
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
 * and only for recognized validation failures. Everything else is rethrown so
 * normal Nest error handling (JSON 400) applies — preserving API clients.
 */
@Catch(BadRequestException)
export class InertiaValidationFilter implements ExceptionFilter {
  constructor(
    @Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  async catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    // Normalize req/res through the platform adapter rather than duck-typing
    // Express vs Fastify inline — the cross-runtime concern lives in adapter/.
    const adapter = resolvePlatformAdapter(this.httpAdapterHost);
    const req = adapter.adaptRequest(http.getRequest<unknown>());
    const rawRes = http.getResponse<unknown>();

    // Disabled (default): rethrow so normal Nest error handling applies. The
    // filter is registered unconditionally but stays inert unless opted in.
    if (!this.options.validation?.enabled) {
      throw exception;
    }

    const method = req.method;

    // Gate: only Inertia non-GET requests. Else rethrow for normal handling.
    if (!req.header('X-Inertia') || method === 'GET' || method === undefined) {
      throw exception;
    }

    const errors = extractFieldErrors(exception, {
      mergeMessages: this.options.validation?.mergeMessages ?? 'first',
    });
    if (errors === null) {
      throw exception;
    }

    // Error-bag scoping (symmetric with ErrorBagInterceptor on the happy path).
    // The bag wrapper nests one level deeper; `FlashErrors` is recursive so this
    // is representable directly (no cast). The read side passes it through
    // untouched.
    const bag = req.header('X-Inertia-Error-Bag');
    const scoped: FlashErrors = bag ? { [bag]: errors } : errors;

    // flashStore presence is guaranteed by the bootstrap check in module.ts.
    // Write against the underlying framework request: Fastify exposes the Node
    // req as `.raw`; Express is the request itself.
    const flashStore = this.options.flashStore;
    if (flashStore?.write) {
      const frameworkReq = req.raw as { raw?: unknown };
      await flashStore.write(frameworkReq.raw ?? frameworkReq, scoped);
    }

    const target = this.resolveRedirectTarget(req);
    adapter.adaptResponse(rawRes).status(303).setHeader('Location', target).end();
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
