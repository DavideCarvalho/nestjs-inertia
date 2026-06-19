import { type ArgumentsHost, BadRequestException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { FlashStore } from '../../src/flash/flash-store.js';
import type { InertiaModuleOptions } from '../../src/types.js';
import { InertiaValidationFilter } from '../../src/validation/inertia-validation.filter.js';

const fastifyHost = {
  httpAdapter: { getType: () => 'fastify' },
} as unknown as HttpAdapterHost;

// Raw Fastify request: no header() method, headers dict only; carries a .raw.
function fakeFastifyReq(
  overrides: Partial<{
    method: string;
    headers: Record<string, string>;
    raw: unknown;
  }> = {},
) {
  return {
    method: overrides.method ?? 'POST',
    raw: overrides.raw,
    headers: overrides.headers ?? {},
  };
}

// Raw Fastify reply: code()/header()/send().
function fakeFastifyRes() {
  let status = 200;
  const headers: Record<string, string> = {};
  let sent = false;
  return {
    code(c: number) {
      status = c;
      return this;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    send() {
      sent = true;
      return this;
    },
    get _status() {
      return status;
    },
    get _headers() {
      return headers;
    },
    get _sent() {
      return sent;
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
  return { filter: new InertiaValidationFilter(options, fastifyHost), write };
}

describe('InertiaValidationFilter (fastify)', () => {
  it('reads headers via dict, writes errors, 303-redirects to Referer', async () => {
    const { filter, write } = makeFilter();
    const raw = { fastifyRaw: true };
    const req = fakeFastifyReq({
      headers: {
        'x-inertia': 'true',
        host: 'localhost:3000',
        referer: 'http://localhost:3000/login',
      },
      raw,
    });
    const res = fakeFastifyRes();
    const ex = new BadRequestException({
      message: 'Contract validation failed',
      issues: [{ path: ['email'], message: 'Invalid email' }],
    });

    await filter.catch(ex, fakeHost(req, res));

    expect(write).toHaveBeenCalledWith(raw, { email: 'Invalid email' });
    expect(res._status).toBe(303);
    expect(res._headers.Location).toBe('/login');
    expect(res._sent).toBe(true);
  });

  it('scopes errors under the bag (Fastify header dict)', async () => {
    const { filter, write } = makeFilter();
    const req = fakeFastifyReq({
      headers: {
        'x-inertia': 'true',
        'x-inertia-error-bag': 'edit',
        host: 'localhost:3000',
        referer: 'http://localhost:3000/posts/1/edit',
      },
    });
    const res = fakeFastifyRes();
    const ex = new BadRequestException({ __inertiaErrors: { title: 'required' } });

    await filter.catch(ex, fakeHost(req, res));

    expect(write).toHaveBeenCalledWith(req, { edit: { title: 'required' } });
  });

  it('rethrows for non-Inertia requests', async () => {
    const { filter, write } = makeFilter();
    const req = fakeFastifyReq({ headers: {} });
    const res = fakeFastifyRes();
    const ex = new BadRequestException({ __inertiaErrors: { email: 'required' } });

    await expect(filter.catch(ex, fakeHost(req, res))).rejects.toBe(ex);
    expect(write).not.toHaveBeenCalled();
  });
});
