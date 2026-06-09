import { type ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { FlashStore } from '../../src/flash/flash-store.js';
import type { InertiaModuleOptions } from '../../src/types.js';
import { InertiaValidationFilter } from '../../src/validation/inertia-validation.filter.js';

function fakeExpressReq(
  overrides: Partial<{
    method: string;
    headers: Record<string, string>;
    raw: unknown;
  }> = {},
) {
  const headers = overrides.headers ?? {};
  return {
    method: overrides.method ?? 'POST',
    raw: overrides.raw,
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function fakeExpressRes() {
  let status = 200;
  const headers: Record<string, string> = {};
  let ended = false;
  return {
    status(code: number) {
      status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    end() {
      ended = true;
    },
    get _status() {
      return status;
    },
    get _headers() {
      return headers;
    },
    get _ended() {
      return ended;
    },
  };
}

function fakeHost(req: unknown, res: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
}

function makeFilter(opts: Partial<InertiaModuleOptions> = {}, write = vi.fn()) {
  const flashStore: FlashStore = { read: () => ({}), write };
  const options: InertiaModuleOptions = {
    flashStore,
    validation: { enabled: true },
    ...opts,
  };
  return { filter: new InertiaValidationFilter(options), write };
}

describe('InertiaValidationFilter (express)', () => {
  it('writes field-keyed errors and 303-redirects to Referer', async () => {
    const { filter, write } = makeFilter();
    const raw = { iAmRaw: true };
    const req = fakeExpressReq({
      headers: {
        'x-inertia': 'true',
        host: 'localhost:3000',
        referer: 'http://localhost:3000/login',
      },
      raw,
    });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await filter.catch(ex, fakeHost(req, res));

    expect(write).toHaveBeenCalledWith(raw, { email: 'required' });
    expect(res._status).toBe(303);
    expect(res._headers.Location).toBe('/login');
    expect(res._ended).toBe(true);
  });

  it('scopes errors under the error bag when X-Inertia-Error-Bag is set', async () => {
    const { filter, write } = makeFilter();
    const req = fakeExpressReq({
      headers: {
        'x-inertia': 'true',
        'x-inertia-error-bag': 'login',
        host: 'localhost:3000',
        referer: 'http://localhost:3000/login',
      },
    });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await filter.catch(ex, fakeHost(req, res));

    expect(write).toHaveBeenCalledWith(req, { login: { email: 'required' } });
  });

  it('falls back to fallbackRedirect for a cross-origin Referer', async () => {
    const { filter } = makeFilter({ validation: { enabled: true, fallbackRedirect: '/safe' } });
    const req = fakeExpressReq({
      headers: { 'x-inertia': 'true', host: 'localhost:3000', referer: 'http://evil.com/phish' },
    });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await filter.catch(ex, fakeHost(req, res));

    expect(res._status).toBe(303);
    expect(res._headers.Location).toBe('/safe');
  });

  it('falls back when Referer is absent', async () => {
    const { filter } = makeFilter();
    const req = fakeExpressReq({ headers: { 'x-inertia': 'true' } });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await filter.catch(ex, fakeHost(req, res));

    expect(res._headers.Location).toBe('/');
  });

  it('rethrows for non-Inertia requests (no write)', async () => {
    const { filter, write } = makeFilter();
    const req = fakeExpressReq({ headers: {} });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await expect(filter.catch(ex, fakeHost(req, res))).rejects.toBe(ex);
    expect(write).not.toHaveBeenCalled();
  });

  it('rethrows for GET requests', async () => {
    const { filter, write } = makeFilter();
    const req = fakeExpressReq({ method: 'GET', headers: { 'x-inertia': 'true' } });
    const res = fakeExpressRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await expect(filter.catch(ex, fakeHost(req, res))).rejects.toBe(ex);
    expect(write).not.toHaveBeenCalled();
  });

  it('rethrows for unrecognized (non-validation) BadRequest', async () => {
    const { filter, write } = makeFilter();
    const req = fakeExpressReq({ headers: { 'x-inertia': 'true' } });
    const res = fakeExpressRes();
    const ex = new BadRequestException('plain message');

    await expect(filter.catch(ex, fakeHost(req, res))).rejects.toBe(ex);
    expect(write).not.toHaveBeenCalled();
  });
});
