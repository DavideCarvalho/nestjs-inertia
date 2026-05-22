import type { InertiaRequest } from '../../src/adapter/adapter.js';

export function fakeRequest(
  opts: {
    method?: string;
    originalUrl?: string;
    url?: string;
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): InertiaRequest {
  const headers = opts.headers ?? {};
  const req: InertiaRequest = {
    method: opts.method ?? 'GET',
    originalUrl: opts.originalUrl ?? '/',
    url: opts.url ?? '/',
    header(name) {
      return headers[name.toLowerCase()];
    },
    raw: {},
  };
  if (opts.body !== undefined) (req as Record<string, unknown>).body = opts.body;
  if (opts.query !== undefined) (req as Record<string, unknown>).query = opts.query;
  return req;
}
