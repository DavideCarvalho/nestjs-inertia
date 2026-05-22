import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { InvalidCsrfTokenException } from '../errors/exceptions.js';
import { verifyCsrfToken } from './csrf-token.js';

export interface CsrfGuardOptions {
  secret: string;
  cookieName?: string;
  headerName?: string;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly cookieName: string;
  private readonly headerName: string;

  constructor(private readonly options: CsrfGuardOptions) {
    this.cookieName = options.cookieName ?? 'XSRF-TOKEN';
    this.headerName = (options.headerName ?? 'X-XSRF-TOKEN').toLowerCase();
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      method: string;
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
    }>();
    if (SAFE.has(req.method)) return true;

    const cookieToken = req.cookies?.[this.cookieName];
    const headerRaw = req.headers[this.headerName];
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!cookieToken || !headerToken) throw new InvalidCsrfTokenException();
    if (cookieToken !== headerToken) throw new InvalidCsrfTokenException();
    if (!verifyCsrfToken(cookieToken, this.options.secret)) throw new InvalidCsrfTokenException();

    return true;
  }
}
