import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

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

/** Works for both Express (req.header(n)) and raw Fastify (req.headers[n]) */
function getHeader(req: unknown, name: string): string | undefined {
  const r = req as {
    header?: (n: string) => string | undefined;
    headers?: Record<string, string | string[] | undefined>;
  };
  if (typeof r.header === 'function') return r.header(name);
  const v = r.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/** Detect platform: Fastify raw reply has 'log' and 'request' properties; Express response doesn't. */
function isFastifyReply(res: unknown): boolean {
  const r = res as { log?: unknown; request?: unknown };
  return typeof r.log !== 'undefined' && typeof r.request !== 'undefined';
}

/** Set status code — Express uses res.status(n), Fastify uses reply.code(n) */
function setStatus(res: unknown, code: number): void {
  const r = res as { status?: (n: number) => unknown; code?: (n: number) => unknown };
  if (typeof r.status === 'function') {
    r.status(code);
    return;
  }
  if (typeof r.code === 'function') {
    r.code(code);
  }
}

/** Set response header — Express uses res.setHeader(), Fastify uses reply.header() */
function setResHeader(res: unknown, name: string, value: string): void {
  const r = res as {
    setHeader?: (n: string, v: string) => unknown;
    header?: (n: string, v: string) => unknown;
  };
  if (typeof r.setHeader === 'function') {
    r.setHeader(name, value);
    return;
  }
  if (typeof r.header === 'function') {
    r.header(name, value);
  }
}

/** End the response — Express uses res.end(), Fastify uses reply.send('') */
function endResponse(res: unknown): void {
  const r = res as { end?: () => void; send?: (body: string) => void };
  if (typeof r.end === 'function') {
    r.end();
    return;
  }
  if (typeof r.send === 'function') {
    r.send('');
  }
}

@Injectable()
export class InertiaAuthGuard implements CanActivate {
  constructor(private readonly options: InertiaAuthGuardOptions) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<unknown>();
    const res = ctx.switchToHttp().getResponse<unknown>();
    const reqObj = req as { user?: unknown; url?: string; originalUrl?: string };

    if (reqObj.user) return true;
    const path = reqObj.originalUrl ?? reqObj.url ?? '/';
    for (const pattern of this.options.allowList) {
      if (matchesAllow(pattern, path)) return true;
    }

    const isEcho = path === this.options.signInUrl || path.startsWith(`${this.options.signInUrl}?`);
    const target = isEcho
      ? this.options.signInUrl
      : `${this.options.signInUrl}?return_to=${encodeURIComponent(path)}`;

    if (getHeader(req, 'X-Inertia')) {
      setStatus(res, 409);
      setResHeader(res, 'X-Inertia-Location', target);
      endResponse(res);
    } else {
      // Express: redirect(status, url); Fastify: redirect(url, status)
      const r = res as { redirect: (...args: unknown[]) => void };
      if (isFastifyReply(res)) {
        r.redirect(target, 302);
      } else {
        r.redirect(302, target);
      }
    }
    return false;
  }
}
