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

  it('patches res.redirect(status, url) to upgrade 302 → 303 on PUT Inertia', async () => {
    const calls: Array<{ status: number; url: string }> = [];
    const req = makeReq('PUT', { 'x-inertia': 'true' });
    const res = {
      statusCode: 200,
      redirect(status: number, url: string) {
        calls.push({ status, url });
      },
    };
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    // Now call the patched redirect with 302
    (res as { redirect: (...args: unknown[]) => unknown }).redirect(302, '/target');
    expect(calls[0]).toEqual({ status: 303, url: '/target' });
  });

  it('patches res.redirect(url) string-only call to use 303 on DELETE Inertia', async () => {
    const calls: Array<{ status: number; url: string }> = [];
    const req = makeReq('DELETE', { 'x-inertia': 'true' });
    const res = {
      statusCode: 200,
      redirect(statusOrUrl: number | string, url?: string) {
        if (typeof statusOrUrl === 'string') {
          calls.push({ status: 302, url: statusOrUrl });
        } else {
          calls.push({ status: statusOrUrl, url: url! });
        }
      },
    };
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    // Call patched redirect with string-only (Express style redirect(url))
    (res as { redirect: (...args: unknown[]) => unknown }).redirect('/somewhere');
    expect(calls[0]).toEqual({ status: 303, url: '/somewhere' });
  });

  it('patches res.redirect but does NOT upgrade non-302 status', async () => {
    const calls: Array<{ status: number; url: string }> = [];
    const req = makeReq('PATCH', { 'x-inertia': 'true' });
    const res = {
      statusCode: 200,
      redirect(status: number, url: string) {
        calls.push({ status, url });
      },
    };
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    // Call patched redirect with 301 (not 302) — should pass through unchanged
    (res as { redirect: (...args: unknown[]) => unknown }).redirect(301, '/target');
    expect(calls[0]).toEqual({ status: 301, url: '/target' });
  });

  it('patches Fastify reply.code to upgrade 302 → 303 on PUT Inertia', async () => {
    const codeCalls: number[] = [];
    const req = makeReq('PUT', { 'x-inertia': 'true' });
    const res = {
      statusCode: 200,
      code(n: number) {
        codeCalls.push(n);
        return this;
      },
    };
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    (res as { code: (...args: unknown[]) => unknown }).code(302);
    expect(codeCalls).toContain(303);
  });

  it('Fastify reply.code passthrough for non-302', async () => {
    const codeCalls: number[] = [];
    const req = makeReq('PUT', { 'x-inertia': 'true' });
    const res = {
      statusCode: 200,
      code(n: number) {
        codeCalls.push(n);
        return this;
      },
    };
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    (res as { code: (...args: unknown[]) => unknown }).code(301);
    expect(codeCalls).toContain(301);
  });

  it('uses Fastify-style headers lookup when req.header is not a function', async () => {
    const req = {
      method: 'PUT',
      headers: { 'x-inertia': 'true' },
    };
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(303);
  });

  it('handles array header values in Fastify-style lookup', async () => {
    const req = {
      method: 'DELETE',
      headers: { 'x-inertia': ['true', 'extra'] },
    };
    const res = makeRes(302);
    const interceptor = new RedirectInterceptor({ autoUpgrade303: true });
    await lastValueFrom(
      interceptor.intercept(makeContext(req, res), { handle: () => of(undefined) }),
      { defaultValue: undefined },
    );
    expect(res.statusCode).toBe(303);
  });
});
