import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { lastValueFrom, of } from 'rxjs';
import { RedirectInterceptor } from '../src/interceptor/redirect.interceptor.js';

function makeReq(method: string, headers: Record<string, string> = {}): unknown {
  return {
    method,
    header: (n: string) => headers[n.toLowerCase()],
  };
}

function makeRes(statusCode = 200) {
  return {
    statusCode,
    headersSent: false,
  };
}

function makeContext(req: unknown, res: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as never;
}

describe('RedirectInterceptor — 302 → 303 upgrade for PUT/PATCH/DELETE on Inertia requests', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])('upgrades 302 → 303 for %s Inertia', async (method) => {
    const req = makeReq(method, { 'x-inertia': 'true' });
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(303);
  });

  it('GET 302 stays 302', async () => {
    const req = makeReq('GET', { 'x-inertia': 'true' });
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(302);
  });

  it('non-Inertia PUT 302 stays 302', async () => {
    const req = makeReq('PUT', {});
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(302);
  });

  it('does not touch 200/4xx/5xx', async () => {
    for (const code of [200, 400, 500]) {
      const req = makeReq('PUT', { 'x-inertia': 'true' });
      const res = makeRes(code);
      const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
      await lastValueFrom(
        interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
        { defaultValue: undefined },
      );
      expect(res.statusCode).toBe(code);
    }
  });

  it('does NOTHING when autoUpgrade303: false', async () => {
    const req = makeReq('PUT', { 'x-inertia': 'true' });
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: false });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(302);
  });
});
