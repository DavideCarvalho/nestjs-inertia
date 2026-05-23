import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { generateCsrfToken, verifyCsrfToken } from './csrf-token.js';

type CookieResponse = {
  cookie?: (name: string, value: string, opts?: unknown) => unknown;
  setCookie?: (name: string, value: string, opts?: unknown) => unknown;
};

function writeCsrfCookie(
  res: CookieResponse,
  cookieName: string,
  token: string,
  cookieOpts: Record<string, unknown>,
): void {
  if (typeof res.cookie === 'function') {
    res.cookie(cookieName, token, cookieOpts);
  } else if (typeof res.setCookie === 'function') {
    res.setCookie(cookieName, token, cookieOpts);
  }
}

/**
 * Force-issue a new CSRF token on the next response, discarding the existing
 * one. Call this when the session principal changes (e.g. after issuing a new
 * session) to prevent token fixation attacks.
 *
 * If you need to invalidate prior tokens (e.g., after session principal change),
 * configure `tokenContext` to return a session-bound value (session ID, nonce) —
 * old tokens fail verification when that value changes.
 *
 * @example
 * ```ts
 * rotateCsrfToken(res, { secret: this.csrfSecret });
 * ```
 */
export function rotateCsrfToken(
  res: CookieResponse,
  options: Pick<CsrfCookieOptions, 'secret' | 'cookieName' | 'httpOnly' | 'sameSite' | 'secure'>,
  context?: string,
): void {
  const cookieName = options.cookieName ?? 'XSRF-TOKEN';
  const token = generateCsrfToken(options.secret, context);
  const cookieOpts = {
    httpOnly: options.httpOnly ?? false,
    sameSite: options.sameSite ?? 'lax',
    secure: options.secure ?? process.env.NODE_ENV === 'production',
    path: '/',
  };
  writeCsrfCookie(res, cookieName, token, cookieOpts);
}

export interface CsrfCookieOptions {
  secret: string;
  cookieName?: string;
  headerName?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  httpOnly?: boolean;
  secure?: boolean;
  /**
   * Optional function to extract a session-bound context value from the request.
   * When provided, the HMAC payload includes this value so that tokens become
   * invalid when the context changes (e.g. after a session principal change).
   * Typical values: session ID, session nonce.
   *
   * @example
   * ```ts
   * tokenContext: (req) => req.session?.id ?? ''
   * ```
   */
  tokenContext?: (req: unknown) => string;
}

@Injectable()
export class CsrfCookieInterceptor implements NestInterceptor {
  private readonly cookieName: string;

  constructor(private readonly options: CsrfCookieOptions) {
    this.cookieName = options.cookieName ?? 'XSRF-TOKEN';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ cookies?: Record<string, string> }>();
    const res = context.switchToHttp().getResponse<CookieResponse>();

    const ctx = this.options.tokenContext ? this.options.tokenContext(req) : undefined;
    const existing = req.cookies?.[this.cookieName];
    if (!existing || !verifyCsrfToken(existing, this.options.secret, ctx)) {
      rotateCsrfToken(res, this.options, ctx);
    }
    return next.handle();
  }
}
