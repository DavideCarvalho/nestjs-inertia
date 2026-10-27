import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expressAdapter } from '../src/adapter/express.js';
import { InertiaMiddleware } from '../src/middleware/express.middleware.js';
import { InertiaService } from '../src/service.js';

function fakeRes() {
  return {
    headersSent: false,
    writableEnded: false,
    status() {
      return this;
    },
    json() {},
    send() {},
    header() {},
    setHeader() {},
    end() {},
  };
}

function runMiddleware() {
  const middleware = new InertiaMiddleware(
    'v1',
    null,
    {},
    { render: async () => '<html/>' },
    { load: async () => null },
  );
  const req = { method: 'GET', originalUrl: '/', url: '/', headers: {} } as unknown as Request & {
    inertia: InertiaService;
  };
  const next = vi.fn();
  middleware.use(req, fakeRes() as unknown as Response, next);
  expect(next).toHaveBeenCalledOnce();
  return req;
}

afterEach(() => vi.restoreAllMocks());

describe('InertiaMiddleware — req.inertia is built on first use', () => {
  it('builds nothing for a request that never touches req.inertia', () => {
    const adaptRequest = vi.spyOn(expressAdapter, 'adaptRequest');
    const adaptResponse = vi.spyOn(expressAdapter, 'adaptResponse');
    runMiddleware();
    expect(adaptRequest).not.toHaveBeenCalled();
    expect(adaptResponse).not.toHaveBeenCalled();
  });

  it('builds one InertiaService on first read and returns it on every read', () => {
    const adaptRequest = vi.spyOn(expressAdapter, 'adaptRequest');
    const req = runMiddleware();
    const first = req.inertia;
    expect(first).toBeInstanceOf(InertiaService);
    expect(req.inertia).toBe(first);
    expect(adaptRequest).toHaveBeenCalledOnce();
  });

  it('accepts an assigned service without building the default one', () => {
    const adaptRequest = vi.spyOn(expressAdapter, 'adaptRequest');
    const req = runMiddleware();
    const replacement = {} as InertiaService;
    req.inertia = replacement;
    expect(req.inertia).toBe(replacement);
    expect(adaptRequest).not.toHaveBeenCalled();
  });
});
