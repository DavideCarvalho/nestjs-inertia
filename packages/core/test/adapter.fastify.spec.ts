import { describe, expect, it, vi } from 'vitest';
import { fastifyAdapter } from '../src/adapter/fastify.js';

function fakeFastifyReq(
  overrides: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, unknown>;
  } = {},
) {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    body: overrides.body,
    query: overrides.query,
    raw: { originalUrl: overrides.url ?? '/' },
  };
}

function fakeFastifyReply() {
  let status = 200;
  const headers: Record<string, string> = {};
  let sent = false;
  const calls: string[] = [];
  return {
    get statusCode() {
      return status;
    },
    set statusCode(v: number) {
      status = v;
    },
    get sent() {
      return sent;
    },
    status(code: number) {
      status = code;
      return this;
    },
    code(c: number) {
      status = c;
      return this;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    send(body: unknown) {
      calls.push(`send:${typeof body === 'string' ? body.slice(0, 30) : JSON.stringify(body)}`);
      sent = true;
    },
    type(_t: string) {
      return this;
    },
    redirect(url: string, status?: number) {
      headers.Location = url;
      this.statusCode = status ?? 302;
      sent = true;
    },
    raw: {
      end: vi.fn(() => {
        sent = true;
      }),
    },
    _captured: { calls, headers },
  };
}

describe('fastifyAdapter', () => {
  it('adaptRequest reads method, url, header', () => {
    const raw = fakeFastifyReq({ method: 'POST', url: '/foo', headers: { 'x-inertia': 'true' } });
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.method).toBe('POST');
    expect(req.originalUrl).toBe('/foo');
    expect(req.header('X-Inertia')).toBe('true');
    expect(req.raw).toBe(raw);
  });

  it('adaptResponse.json sets statusCode and JSON content', () => {
    const raw = fakeFastifyReply();
    const res = fastifyAdapter.adaptResponse(raw);
    res.status(409).json({ ok: true });
    expect(raw.statusCode).toBe(409);
    expect(raw._captured.calls).toContain('send:{"ok":true}');
  });

  it('adaptResponse.html sends with Content-Type text/html', () => {
    const raw = fakeFastifyReply();
    const res = fastifyAdapter.adaptResponse(raw);
    res.html('<html/>');
    expect(raw._captured.headers['Content-Type']).toMatch(/text\/html/);
  });

  it('adaptResponse.setHeader writes headers', () => {
    const raw = fakeFastifyReply();
    const res = fastifyAdapter.adaptResponse(raw);
    res.setHeader('X-Inertia-Location', '/somewhere');
    expect(raw._captured.headers['X-Inertia-Location']).toBe('/somewhere');
  });

  it('adaptResponse mirrors sent → headersSent', () => {
    const raw = fakeFastifyReply();
    const res = fastifyAdapter.adaptResponse(raw);
    expect(res.headersSent).toBe(false);
    res.json({});
    expect(res.headersSent).toBe(true);
  });

  it('adaptRequest omits body when undefined', () => {
    const raw = fakeFastifyReq(); // body defaults to undefined
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.body).toBeUndefined();
  });

  it('adaptRequest includes body when defined', () => {
    const raw = fakeFastifyReq({ body: { name: 'test' } });
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.body).toEqual({ name: 'test' });
  });

  it('adaptRequest omits query when undefined', () => {
    const raw = { method: 'GET', url: '/', headers: {}, raw: { originalUrl: '/' } };
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.query).toBeUndefined();
  });

  it('adaptRequest includes query when defined', () => {
    const raw = fakeFastifyReq({ query: { page: '2' } });
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.query).toEqual({ page: '2' });
  });

  it('adaptRequest falls back to r.url when raw.originalUrl is missing', () => {
    const raw = { method: 'GET', url: '/fallback', headers: {} };
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.originalUrl).toBe('/fallback');
  });

  it('adaptRequest returns first element when header value is an array', () => {
    const raw = {
      method: 'GET',
      url: '/',
      headers: { 'x-custom': ['first', 'second'] },
      raw: { originalUrl: '/' },
    };
    const req = fastifyAdapter.adaptRequest(raw);
    expect(req.header('X-Custom')).toBe('first');
  });

  it('adaptResponse.statusCode delegates to raw reply', () => {
    const raw = fakeFastifyReply();
    raw.statusCode = 404;
    const res = fastifyAdapter.adaptResponse(raw);
    expect(res.statusCode).toBe(404);
  });

  it('adaptResponse.getHeader reads from raw reply', () => {
    const raw = fakeFastifyReply();
    raw.header('X-Custom', 'val');
    const res = fastifyAdapter.adaptResponse(raw);
    expect(res.getHeader('X-Custom')).toBe('val');
  });

  it('adaptResponse.end sends empty string', () => {
    const raw = fakeFastifyReply();
    const res = fastifyAdapter.adaptResponse(raw);
    res.end();
    expect(raw._captured.calls).toContain('send:');
  });
});
