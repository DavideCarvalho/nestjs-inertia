/* v8 ignore next -- import resolution is not a branch */
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import superjson from 'superjson';
import type { FetcherOptions } from '../fetcher/fetcher.js';

/**
 * Header the client sends to opt in to superjson serialization. The server
 * interceptor only superjson-serializes responses when this header is present,
 * so plain-JSON consumers are never affected.
 */
export const SUPERJSON_HEADER = 'x-superjson';

/**
 * Fetcher options that make a {@link createFetcher} consumer speak superjson:
 * it sends the `x-superjson: 1` opt-in header and revives the response body via
 * `superjson.deserialize` (restoring `Date`/`Map`/`Set`/`BigInt` etc.).
 *
 * @example
 * import { createFetcher } from '@dudousxd/nestjs-inertia-client';
 * import { superjsonFetcherOptions } from '@dudousxd/nestjs-inertia-client/superjson';
 *
 * export const fetcher = createFetcher({ baseUrl: '/api', ...superjsonFetcherOptions() });
 */
export function superjsonFetcherOptions(): Pick<FetcherOptions, 'headers' | 'deserialize'> {
  return {
    headers: () => ({ [SUPERJSON_HEADER]: '1' }),
    deserialize: (raw) => superjson.deserialize(raw as Parameters<typeof superjson.deserialize>[0]),
  };
}

/**
 * Merge {@link superjsonFetcherOptions} into an existing {@link FetcherOptions},
 * composing any caller-supplied `headers()` with the superjson opt-in header so
 * both sets of headers are sent.
 *
 * @example
 * createFetcher(withSuperjson({ baseUrl: '/api', headers: () => ({ authorization }) }))
 */
export function withSuperjson(opts: FetcherOptions = {}): FetcherOptions {
  const callerHeaders = opts.headers;
  return {
    ...opts,
    deserialize: (raw) => superjson.deserialize(raw as Parameters<typeof superjson.deserialize>[0]),
    headers: () => ({ ...callerHeaders?.(), [SUPERJSON_HEADER]: '1' }),
  };
}

/**
 * NestJS interceptor that superjson-serializes a response into the
 * `{ json, meta }` envelope — but ONLY when the incoming request carries the
 * `x-superjson: 1` header. Requests without it pass through untouched (plain
 * JSON), so superjson can be adopted per-consumer with no atomic cross-app flip.
 *
 * Reachable only via `@dudousxd/nestjs-inertia-client/superjson` so the
 * optional `superjson` peer dependency stays isolated from plain-JSON users.
 */
@Injectable()
export class SuperjsonInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const marker = request?.headers?.[SUPERJSON_HEADER];
    const wantsSuperjson = (Array.isArray(marker) ? marker[0] : marker) === '1';

    if (!wantsSuperjson) {
      return next.handle();
    }

    return next.handle().pipe(map((payload: unknown) => superjson.serialize(payload)));
  }
}
