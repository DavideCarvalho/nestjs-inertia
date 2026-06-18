import { describe, expect, it } from 'vitest';
import { expressAdapter } from '../src/adapter/express.js';

function fakeExpressReq(
  overrides: Partial<{
    method: string;
    originalUrl: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, unknown>;
  }> = {},
) {
  return {
    method: overrides.method ?? 'GET',
    originalUrl: overrides.originalUrl ?? '/',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    body: overrides.body,
    query: overrides.query,
    header(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function fakeExpressRes() {
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
    get headersSent() {
      return sent;
    },
    status(code: number) {
      status = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name];
    },
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    json(body: unknown) {
      calls.push(`json:${JSON.stringify(body)}`);
      sent = true;
    },
    type(_t: string) {
      return this;
    },
    send(body: string) {
      calls.push(`send:${body.slice(0, 30)}`);
      sent = true;
    },
    write(chunk: string) {
      calls.push(`write:${chunk}`);
      sent = true;
      return true;
    },
    end(chunk?: string) {
      calls.push(chunk !== undefined ? `end:${chunk}` : 'end');
      sent = true;
    },
    redirect(_status: number, _url: string) {
      calls.push(`redirect:${_status}:${_url}`);
      sent = true;
    },
    _calls: calls,
    _headers: headers,
  };
}

describe('expressAdapter', () => {
  it('adaptRequest reads method, originalUrl, header', () => {
    const raw = fakeExpressReq({
      method: 'POST',
      originalUrl: '/foo',
      headers: { 'x-inertia': 'true' },
    });
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

  it('adaptRequest omits body when undefined', () => {
    const raw = fakeExpressReq();
    const req = expressAdapter.adaptRequest(raw);
    expect(req.body).toBeUndefined();
  });

  it('adaptRequest includes body when defined', () => {
    const raw = fakeExpressReq({ body: { name: 'test' } });
    const req = expressAdapter.adaptRequest(raw);
    expect(req.body).toEqual({ name: 'test' });
  });

  it('adaptRequest omits query when undefined', () => {
    const raw = fakeExpressReq();
    const req = expressAdapter.adaptRequest(raw);
    expect(req.query).toBeUndefined();
  });

  it('adaptRequest includes query when defined', () => {
    const raw = fakeExpressReq({ query: { page: '2' } });
    const req = expressAdapter.adaptRequest(raw);
    expect(req.query).toEqual({ page: '2' });
  });

  it('adaptRequest falls back to headers dict when header() method is absent', () => {
    const raw = {
      method: 'GET',
      originalUrl: '/',
      url: '/',
      headers: { 'x-inertia': 'true' } as Record<string, string | string[]>,
    };
    const req = expressAdapter.adaptRequest(raw);
    expect(req.header('X-Inertia')).toBe('true');
  });

  it('adaptRequest falls back to headers dict and picks first element of array header', () => {
    const raw = {
      method: 'GET',
      originalUrl: '/',
      url: '/',
      headers: { 'x-multi': ['first', 'second'] } as Record<string, string | string[]>,
    };
    const req = expressAdapter.adaptRequest(raw);
    expect(req.header('X-Multi')).toBe('first');
  });

  it('adaptResponse.getHeader reads from raw response', () => {
    const raw = fakeExpressRes();
    raw.setHeader('X-Custom', 'val');
    const res = expressAdapter.adaptResponse(raw);
    expect(res.getHeader('X-Custom')).toBe('val');
  });

  it('adaptResponse.end calls raw end', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    res.end();
    expect(raw._calls).toContain('end');
  });

  it('adaptResponse.htmlStream writes head chunk, streams writes, and ends with tail', () => {
    const raw = fakeExpressRes();
    const res = expressAdapter.adaptResponse(raw);
    const sink = res.htmlStream('<head-chunk>');
    sink.write('<body-chunk>');
    sink.end('<tail-chunk>');
    expect(raw._headers['Content-Type']).toMatch(/text\/html/);
    expect(raw._calls).toEqual(['write:<head-chunk>', 'write:<body-chunk>', 'end:<tail-chunk>']);
  });
});
