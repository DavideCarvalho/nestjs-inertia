import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
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

    const req = context.switchToHttp().getRequest<{ method: string; header(n: string): string | undefined }>();
    const res = context.switchToHttp().getResponse<{ statusCode: number; redirect?: RedirectFn & RedirectFnWithStatus }>();

    // Patch res.redirect (used by @Res() + res.redirect(302, url)) BEFORE the handler runs.
    if (SAFE_METHODS.has(req.method) && req.header('X-Inertia') && typeof res.redirect === 'function') {
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

    // Also handle handlers that set res.statusCode = 302 directly (without calling res.redirect).
    return next.handle().pipe(
      tap(() => {
        if (
          res.statusCode === 302 &&
          SAFE_METHODS.has(req.method) &&
          req.header('X-Inertia')
        ) {
          res.statusCode = 303;
        }
      }),
    );
  }
}
