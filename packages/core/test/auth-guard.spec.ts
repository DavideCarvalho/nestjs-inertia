import { describe, expect, it, vi } from 'vitest';
import { InertiaAuthGuard } from '../src/guard/auth.guard.js';

function makeCtx(req: unknown, res: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as never;
}

function makeReq(
  overrides: {
    user?: unknown;
    url?: string;
    originalUrl?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = overrides.headers ?? {};
  return {
    user: overrides.user,
    url: overrides.url ?? '/protected',
    originalUrl: overrides.originalUrl ?? overrides.url ?? '/protected',
    header: (n: string) => headers[n.toLowerCase()],
  };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn(),
    end: vi.fn(),
  };
}

describe('InertiaAuthGuard', () => {
  it('passes when req.user is defined', () => {
    const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: [] });
    const ctx = makeCtx(makeReq({ user: { id: '1' } }), makeRes());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when path matches allowList', () => {
    const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: ['/health'] });
    const ctx = makeCtx(makeReq({ url: '/health', originalUrl: '/health' }), makeRes());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when path matches glob pattern in allowList', () => {
    const guard = new InertiaAuthGuard({
      signInUrl: '/signin',
      allowList: ['/signin/*', '/health'],
    });
    const ctx = makeCtx(
      makeReq({ url: '/signin/callback', originalUrl: '/signin/callback' }),
      makeRes(),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('redirects 302 to signInUrl with return_to for plain browser visit', () => {
    const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: [] });
    const res = makeRes();
    const ctx = makeCtx(makeReq({ url: '/protected', originalUrl: '/protected' }), res);
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith(302, '/signin?return_to=%2Fprotected');
  });

  it('responds 409 + X-Inertia-Location for Inertia XHR', () => {
    const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: [] });
    const res = makeRes();
    const ctx = makeCtx(
      makeReq({ url: '/protected', originalUrl: '/protected', headers: { 'x-inertia': 'true' } }),
      res,
    );
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Inertia-Location',
      '/signin?return_to=%2Fprotected',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('does not echo /signin in return_to when already heading to /signin', () => {
    const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: [] });
    const res = makeRes();
    const ctx = makeCtx(makeReq({ url: '/signin', originalUrl: '/signin' }), res);
    guard.canActivate(ctx);
    expect(res.redirect).toHaveBeenCalledWith(302, '/signin');
  });

  // M-2: URL normalisation before allow-list matching
  describe('M-2: URL normalisation', () => {
    it('strips query string before allow-list matching', () => {
      const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: ['/health'] });
      // /health?foo=bar should normalise to /health and match
      const ctx = makeCtx(
        makeReq({ url: '/health?foo=bar', originalUrl: '/health?foo=bar' }),
        makeRes(),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks path traversal that would bypass /public/* allow rule', () => {
      const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: ['/public/*'] });
      const res = makeRes();
      // /public/../admin normalises to /admin — should NOT be allowed
      const ctx = makeCtx(
        makeReq({ url: '/public/../admin', originalUrl: '/public/../admin' }),
        res,
      );
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('allows a legitimate /public/ path after normalisation', () => {
      const guard = new InertiaAuthGuard({ signInUrl: '/signin', allowList: ['/public/*'] });
      const ctx = makeCtx(
        makeReq({ url: '/public/logo.png', originalUrl: '/public/logo.png' }),
        makeRes(),
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
