import type { RequestAdapter, InertiaRequest, InertiaResponse } from './adapter.js';

type ExpressReq = {
  method: string;
  originalUrl: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  header?: (name: string) => string | undefined;
};

type ExpressRes = {
  statusCode: number;
  headersSent: boolean;
  status(code: number): ExpressRes;
  setHeader(name: string, value: string): ExpressRes;
  getHeader(name: string): string | string[] | number | undefined;
  json(body: unknown): ExpressRes;
  send(body: string): ExpressRes;
  end(): void;
  type(t: string): ExpressRes;
};

export const expressAdapter: RequestAdapter = {
  adaptRequest(raw): InertiaRequest {
    const r = raw as ExpressReq;
    const req: InertiaRequest = {
      method: r.method,
      originalUrl: r.originalUrl,
      url: r.url,
      header(name) {
        if (typeof r.header === 'function') return r.header(name);
        const v = r.headers[name.toLowerCase()];
        return Array.isArray(v) ? v[0] : v;
      },
      raw,
    };
    if (r.body !== undefined) req.body = r.body;
    if (r.query !== undefined) req.query = r.query;
    return req;
  },
  adaptResponse(raw): InertiaResponse {
    const r = raw as ExpressRes;
    const wrapper: InertiaResponse = {
      get statusCode() { return r.statusCode; },
      get headersSent() { return r.headersSent; },
      status(code) { r.status(code); return wrapper; },
      setHeader(name, value) { r.setHeader(name, value); return wrapper; },
      getHeader(name) { return r.getHeader(name); },
      json(body) { r.json(body); },
      html(body) { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.send(body); },
      end() { r.end(); },
      raw,
    };
    return wrapper;
  },
};
