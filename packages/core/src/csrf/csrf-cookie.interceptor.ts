import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { generateCsrfToken, verifyCsrfToken } from './csrf-token.js';

export interface CsrfCookieOptions {
  secret: string;
  cookieName?: string;
  headerName?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  httpOnly?: boolean;
  secure?: boolean;
}

@Injectable()
export class CsrfCookieInterceptor implements NestInterceptor {
  private readonly cookieName: string;

  constructor(private readonly options: CsrfCookieOptions) {
    this.cookieName = options.cookieName ?? 'XSRF-TOKEN';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ cookies?: Record<string, string> }>();
    const res = context.switchToHttp().getResponse<{
      cookie?: (name: string, value: string, opts?: unknown) => unknown;
      setCookie?: (name: string, value: string, opts?: unknown) => unknown;
    }>();

    const existing = req.cookies?.[this.cookieName];
    if (!existing || !verifyCsrfToken(existing, this.options.secret)) {
      const token = generateCsrfToken(this.options.secret);
      const cookieOpts = {
        httpOnly: this.options.httpOnly ?? false,
        sameSite: this.options.sameSite ?? 'lax',
        secure: this.options.secure ?? false,
        path: '/',
      };
      if (typeof res.cookie === 'function') {
        // Express
        res.cookie(this.cookieName, token, cookieOpts);
      } else if (typeof res.setCookie === 'function') {
        // Fastify
        res.setCookie(this.cookieName, token, cookieOpts);
      }
    }
    return next.handle();
  }
}
