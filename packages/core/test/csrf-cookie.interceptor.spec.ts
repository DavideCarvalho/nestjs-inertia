import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { lastValueFrom, of } from 'rxjs';
import { CsrfCookieInterceptor } from '../src/csrf/csrf-cookie.interceptor.js';
import { generateCsrfToken, verifyCsrfToken } from '../src/csrf/csrf-token.js';

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
});
