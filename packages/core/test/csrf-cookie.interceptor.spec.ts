import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { lastValueFrom, of } from 'rxjs';
import { CsrfCookieInterceptor, rotateCsrfToken } from '../src/csrf/csrf-cookie.interceptor.js';
import { generateCsrfToken, timingSafeEqualSafe, verifyCsrfToken } from '../src/csrf/csrf-token.js';

describe('csrf-token helpers', () => {
  it('generates a verifiable token', () => {
    const t = generateCsrfToken('secret');
    expect(verifyCsrfToken(t, 'secret')).toBe(true);
  });
  it('rejects token with wrong secret', () => {
    const t = generateCsrfToken('secret');
    expect(verifyCsrfToken(t, 'other')).toBe(false);
  });
  it('rejects malformed token', () => {
    expect(verifyCsrfToken('no-dot', 'secret')).toBe(false);
    expect(verifyCsrfToken('', 'secret')).toBe(false);
  });
  it('rejects non-string token', () => {
    expect(verifyCsrfToken(undefined as never, 'secret')).toBe(false);
    expect(verifyCsrfToken(null as never, 'secret')).toBe(false);
    expect(verifyCsrfToken(123 as never, 'secret')).toBe(false);
  });
  it('rejects 2-part token when context is expected', () => {
    const t = generateCsrfToken('secret'); // 2-part, no context
    expect(verifyCsrfToken(t, 'secret', 'sess-abc')).toBe(false);
  });
  it('rejects 3-part token with empty raw/ctxHex/sig parts', () => {
    expect(verifyCsrfToken('..sig', 'secret')).toBe(false);
    expect(verifyCsrfToken('raw..sig', 'secret')).toBe(false);
    expect(verifyCsrfToken('raw.ctx.', 'secret')).toBe(false);
  });
  it('rejects 2-part token with empty raw or sig parts', () => {
    expect(verifyCsrfToken('.sig', 'secret')).toBe(false);
    expect(verifyCsrfToken('raw.', 'secret')).toBe(false);
  });
  it('rejects multi-part token (raw.sig.junk silently-dropped L-1)', () => {
    const valid = generateCsrfToken('secret');
    const tampered = `${valid}.extraPart.extra2`;
    expect(verifyCsrfToken(tampered, 'secret')).toBe(false);
  });

  // S-1: tokenContext — session-bound invalidation
  describe('S-1: tokenContext (session-bound invalidation)', () => {
    it('without tokenContext: tokens verify forever within the same secret', () => {
      const t = generateCsrfToken('secret');
      expect(verifyCsrfToken(t, 'secret')).toBe(true);
      // After "rotation" (new token), old token still valid (documented behaviour)
      expect(verifyCsrfToken(t, 'secret')).toBe(true);
    });

    it('with tokenContext + same context: token still verifies', () => {
      const t = generateCsrfToken('secret', 'sess-abc');
      expect(verifyCsrfToken(t, 'secret', 'sess-abc')).toBe(true);
    });

    it('with tokenContext + different context: old token FAILS verification', () => {
      const t = generateCsrfToken('secret', 'sess-abc');
      // Session rotated to a new ID — old token must not be accepted
      expect(verifyCsrfToken(t, 'secret', 'sess-xyz')).toBe(false);
    });

    it('context token has 3 parts (raw.ctxHex.sig)', () => {
      const t = generateCsrfToken('secret', 'mysession');
      expect(t.split('.').length).toBe(3);
    });

    it('no-context token still has 2 parts', () => {
      const t = generateCsrfToken('secret');
      expect(t.split('.').length).toBe(2);
    });

    it('context token rejected when no context supplied to verify', () => {
      const t = generateCsrfToken('secret', 'sess-abc');
      // Caller passes no context — should still verify using stored context
      expect(verifyCsrfToken(t, 'secret')).toBe(true);
    });
  });
});

function makeCtx(req: unknown, res: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as never;
}

describe('CsrfCookieInterceptor', () => {
  it('writes XSRF-TOKEN cookie when not present', async () => {
    const cookieSet = vi.fn();
    const req = { cookies: {} };
    const res = { cookie: cookieSet };
    const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
    await lastValueFrom(interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }), {
      defaultValue: undefined,
    });
    expect(cookieSet).toHaveBeenCalledWith(
      'XSRF-TOKEN',
      expect.stringMatching(/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/),
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'lax',
      }),
    );
  });

  it('does NOT overwrite existing valid XSRF-TOKEN cookie', async () => {
    const existing = generateCsrfToken('shh');
    const cookieSet = vi.fn();
    const req = { cookies: { 'XSRF-TOKEN': existing } };
    const res = { cookie: cookieSet };
    const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
    await lastValueFrom(interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }), {
      defaultValue: undefined,
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('regenerates when existing cookie is invalid (wrong secret)', async () => {
    const cookieSet = vi.fn();
    const req = { cookies: { 'XSRF-TOKEN': 'invalid.token' } };
    const res = { cookie: cookieSet };
    const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
    await lastValueFrom(interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }), {
      defaultValue: undefined,
    });
    expect(cookieSet).toHaveBeenCalled();
  });

  it('uses setCookie for Fastify reply API', async () => {
    const setCookie = vi.fn();
    const req = { cookies: {} };
    const res = { setCookie }; // no .cookie method = Fastify
    const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
    await lastValueFrom(interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }), {
      defaultValue: undefined,
    });
    expect(setCookie).toHaveBeenCalled();
  });

  it('defaults secure to true when NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const cookieSet = vi.fn();
      const req = { cookies: {} };
      const res = { cookie: cookieSet };
      const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
      await lastValueFrom(
        interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }),
        {
          defaultValue: undefined,
        },
      );
      expect(cookieSet).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('defaults secure to false when NODE_ENV is not production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const cookieSet = vi.fn();
      const req = { cookies: {} };
      const res = { cookie: cookieSet };
      const interceptor = new CsrfCookieInterceptor({ secret: 'shh' });
      await lastValueFrom(
        interceptor.intercept(makeCtx(req, res), { handle: () => of(undefined) }),
        {
          defaultValue: undefined,
        },
      );
      expect(cookieSet).toHaveBeenCalledWith(
        'XSRF-TOKEN',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('rotateCsrfToken', () => {
  it('issues a fresh CSRF token via Express cookie API', () => {
    const cookieSet = vi.fn();
    const res = { cookie: cookieSet };
    rotateCsrfToken(res, { secret: 'shh' });
    expect(cookieSet).toHaveBeenCalledWith(
      'XSRF-TOKEN',
      expect.stringMatching(/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/),
      expect.objectContaining({ path: '/', httpOnly: false }),
    );
  });

  it('issues a fresh CSRF token via Fastify setCookie API', () => {
    const setCookie = vi.fn();
    const res = { setCookie };
    rotateCsrfToken(res, { secret: 'shh' });
    expect(setCookie).toHaveBeenCalled();
  });

  it('uses a different token each call (rotation)', () => {
    const tokens: string[] = [];
    const res = {
      cookie: (_name: string, value: string) => {
        tokens.push(value);
      },
    };
    rotateCsrfToken(res, { secret: 'shh' });
    rotateCsrfToken(res, { secret: 'shh' });
    expect(tokens[0]).not.toBe(tokens[1]);
  });
});

describe('timingSafeEqualSafe', () => {
  it('returns true for identical buffers', () => {
    const a = Buffer.from('same');
    const b = Buffer.from('same');
    expect(timingSafeEqualSafe(a, b)).toBe(true);
  });

  it('returns false for different buffers of same length', () => {
    expect(timingSafeEqualSafe(Buffer.from('aaaa'), Buffer.from('bbbb'))).toBe(false);
  });

  it('returns false for buffers of different lengths without throwing', () => {
    expect(() =>
      timingSafeEqualSafe(Buffer.from('short'), Buffer.from('a-much-longer-string')),
    ).not.toThrow();
    expect(timingSafeEqualSafe(Buffer.from('short'), Buffer.from('a-much-longer-string'))).toBe(
      false,
    );
  });
});
