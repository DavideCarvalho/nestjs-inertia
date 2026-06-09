import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getHeader } from '../helpers/get-header.js';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

const SAFE_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);

type RedirectFn = (url: string) => void;
type RedirectFnWithStatus = (status: number, url: string) => void;

@Injectable()
export class RedirectInterceptor implements NestInterceptor {
  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.options.autoUpgrade303 === false) return next.handle();

    const req = context.switchToHttp().getRequest<unknown>();
    const res = context
      .switchToHttp()
      .getResponse<{ statusCode: number; redirect?: RedirectFn & RedirectFnWithStatus }>();
    const method = (req as { method: string }).method;

    if (SAFE_METHODS.has(method) && getHeader(req, 'X-Inertia')) {
      // Patch res.redirect (Express: redirect(status, url)) BEFORE the handler runs.
      if (typeof res.redirect === 'function') {
        const originalRedirect = res.redirect.bind(res) as RedirectFn & RedirectFnWithStatus;
        res.redirect = function patchedRedirect(statusOrUrl: number | string, url?: string): void {
          if (typeof statusOrUrl === 'number' && statusOrUrl === 302) {
            originalRedirect(303, url!);
          } else if (typeof statusOrUrl === 'string') {
            // redirect(url) — Express defaults to 302; upgrade to 303
            originalRedirect(303, statusOrUrl);
          } else {
            originalRedirect(statusOrUrl as number, url!);
          }
        } as RedirectFn & RedirectFnWithStatus;
      }

      // Patch reply.code (Fastify) so handlers using reply.code(302) get upgraded too.
      const resAny = res as unknown as { code?: (n: number) => unknown };
      if (typeof resAny.code === 'function') {
        const originalCode = resAny.code.bind(res) as (n: number) => unknown;
        resAny.code = function patchedCode(n: number) {
          return originalCode(n === 302 ? 303 : n);
        };
      }
    }

    // Also handle handlers that set res.statusCode = 302 directly (without calling res.redirect).
    return next.handle().pipe(
      tap(() => {
        if (res.statusCode === 302 && SAFE_METHODS.has(method) && getHeader(req, 'X-Inertia')) {
          res.statusCode = 303;
        }
      }),
    );
  }
}
