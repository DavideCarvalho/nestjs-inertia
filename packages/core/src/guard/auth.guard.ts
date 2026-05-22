import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

export interface InertiaAuthGuardOptions {
  signInUrl: string;
  allowList: string[];
}

function matchesAllow(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return false;
}

@Injectable()
export class InertiaAuthGuard implements CanActivate {
  constructor(private readonly options: InertiaAuthGuardOptions) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: unknown; url?: string; originalUrl?: string; header(n: string): string | undefined }>();
    const res = ctx.switchToHttp().getResponse<{ status(code: number): unknown; setHeader(name: string, value: string): unknown; redirect(code: number, url: string): void; end(): void }>();

    if (req.user) return true;
    const path = req.originalUrl ?? req.url ?? '/';
    for (const pattern of this.options.allowList) {
      if (matchesAllow(pattern, path)) return true;
    }

    const isEcho = path === this.options.signInUrl || path.startsWith(`${this.options.signInUrl}?`);
    const target = isEcho
      ? this.options.signInUrl
      : `${this.options.signInUrl}?return_to=${encodeURIComponent(path)}`;

    if (req.header('X-Inertia')) {
      res.status(409);
      res.setHeader('X-Inertia-Location', target);
      res.end();
    } else {
      res.redirect(302, target);
    }
    return false;
  }
}
