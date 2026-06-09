import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import type { FlashErrors } from '../flash/flash-store.js';
import { getHeader } from '../helpers/get-header.js';
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
  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions) {}

  async catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const req = http.getRequest<unknown>();
    const res = http.getResponse<unknown>();

    // Disabled (default): rethrow so normal Nest error handling applies. The
    // filter is registered unconditionally but stays inert unless opted in.
    if (!this.options.validation?.enabled) {
      throw exception;
    }

    const method = (req as { method?: string }).method;

    // Gate: only Inertia non-GET requests. Else rethrow for normal handling.
    if (!getHeader(req, 'X-Inertia') || method === 'GET' || method === undefined) {
      throw exception;
    }

    const errors = extractFieldErrors(exception, {
      mergeMessages: this.options.validation?.mergeMessages ?? 'first',
    });
    if (errors === null) {
      throw exception;
    }

    // Error-bag scoping (symmetric with ErrorBagInterceptor on the happy path).
    // The bag wrapper nests one level deeper than the flat FlashErrors shape;
    // the flash store treats it as opaque JSON and the read side passes it
    // through untouched, so the cast is safe.
    const bag = getHeader(req, 'X-Inertia-Error-Bag');
    const scoped: FlashErrors = bag ? ({ [bag]: errors } as unknown as FlashErrors) : errors;

    // flashStore presence is guaranteed by the bootstrap check in module.ts.
    const flashStore = this.options.flashStore;
    if (flashStore?.write) {
      const rawReq = (req as { raw?: unknown }).raw ?? req;
      await flashStore.write(rawReq, scoped);
    }

    const target = this.resolveRedirectTarget(req);
    sendRedirect(res, 303, target);
  }

  private resolveRedirectTarget(req: unknown): string {
    const fallback = this.options.validation?.fallbackRedirect ?? '/';
    const candidate = getHeader(req, 'X-Inertia-Referer') ?? getHeader(req, 'Referer') ?? fallback;
    const host = getHeader(req, 'Host');
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

/**
 * Cross-runtime redirect emit. Sets the status code + `Location` header and ends
 * the response, duck-typing Express (`res.status`/`setHeader`/`end`) vs raw
 * Fastify (`res.code`/`header`/`send`).
 */
function sendRedirect(res: unknown, status: number, url: string): void {
  const r = res as {
    status?: (code: number) => unknown;
    code?: (code: number) => unknown;
    setHeader?: (name: string, value: string) => unknown;
    header?: (name: string, value: string) => unknown;
    end?: () => unknown;
    send?: (body?: unknown) => unknown;
  };

  if (typeof r.status === 'function') {
    r.status(status);
  } else if (typeof r.code === 'function') {
    r.code(status);
  }

  if (typeof r.setHeader === 'function') {
    r.setHeader('Location', url);
  } else if (typeof r.header === 'function') {
    r.header('Location', url);
  }

  if (typeof r.end === 'function') {
    r.end();
  } else if (typeof r.send === 'function') {
    r.send();
  }
}
