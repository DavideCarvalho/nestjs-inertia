import { describe, it, expect } from 'vitest';
import { expressAdapter } from '../src/adapter/express.js';

function fakeExpressReq(overrides: Partial<{ method: string; originalUrl: string; url: string; headers: Record<string, string>; body: unknown; query: Record<string, unknown> }> = {}) {
  return {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.originalUrl ?? '/',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    body: overrides.body,
    query: overrides.query,
    header(name: string) { return this.headers[name.toLowerCase()]; },
  };
}

function fakeExpressRes() {
  let status = 200;
  const headers: Record<string, string> = {};
  let sent = false;
  const calls: string[] = [];
  return {
    get statusCode() { return status; },
    set statusCode(v: number) { status = v; },
    get headersSent() { return sent; },
    status(code: number) { status = code; return this; },
    setHeader(name: string, value: string) { headers[name] = value; return this; },
    getHeader(name: string) { return headers[name]; },
    header(name: string, value: string) { headers[name] = value; return this; },
    json(body: unknown) { calls.push(`json:${JSON.stringify(body)}`); sent = true; },
    type(_t: string) { return this; },
    send(body: string) { calls.push(`send:${body.slice(0, 30)}`); sent = true; },
    end() { calls.push('end'); sent = true; },
    redirect(_status: number, _url: string) { calls.push(`redirect:${_status}:${_url}`); sent = true; },
    _calls: calls,
    _headers: headers,
  };
}

describe('expressAdapter', () => {
  it('adaptRequest reads method, originalUrl, header', () => {
    const raw = fakeExpressReq({ method: 'POST', originalUrl: '/foo', headers: { 'x-inertia': 'true' } });
    const req = expressAdapter.adaptRequest(raw);
    expect(req.method).toBe('POST');
    expect(req.originalUrl).toBe('/foo');
    expect(req.header('X-Inertia')).toBe('true');
    expect(req.raw).toBe(raw);
  });

  it('adaptResponse.json sets statusCode and JSON content', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    res.status(409).json({ ok: true });
    expect(raw.statusCode).toBe(409);
    expect(raw._calls).toContain('json:{"ok":true}');
  });

  it('adaptResponse.html uses .send with Content-Type text/html', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    res.html('<html/>');
    expect(raw._headers['Content-Type']).toMatch(/text\/html/);
    expect(raw._calls[0]).toMatch(/^send:</);
  });

  it('adaptResponse.setHeader writes headers', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    res.setHeader('X-Inertia-Location', '/somewhere');
    expect(raw._headers['X-Inertia-Location']).toBe('/somewhere');
  });

  it('adaptResponse mirrors headersSent from raw', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    expect(res.headersSent).toBe(false);
    res.json({});
    expect(res.headersSent).toBe(true);
  });
});
