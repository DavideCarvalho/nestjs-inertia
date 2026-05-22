export interface FakeInertiaRequest {
  method: string;
  originalUrl: string;
  url: string;
  body?: unknown;
  query?: Record<string, unknown>;
  header(name: string): string | undefined;
  raw: unknown;
}

export function createFakeInertiaRequest(opts: {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
} = {}): FakeInertiaRequest {
  const headers = opts.headers ?? {};
  const req: FakeInertiaRequest = {
    method: opts.method ?? 'GET',
    originalUrl: opts.originalUrl ?? opts.url ?? '/',
    url: opts.url ?? '/',
    header(name: string) { return headers[name.toLowerCase()]; },
    raw: {},
  };
  if (opts.body !== undefined) req.body = opts.body;
  if (opts.query !== undefined) req.query = opts.query;
  return req;
}
