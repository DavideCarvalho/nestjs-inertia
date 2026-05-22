import type { InertiaRequest, InertiaResponse, RequestAdapter } from './adapter.js';

type FastifyReq = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  raw?: { originalUrl?: string };
};

type FastifyReply = {
  statusCode: number;
  sent: boolean;
  status(code: number): FastifyReply;
  code(code: number): FastifyReply;
  header(name: string, value: string): FastifyReply;
  getHeader(name: string): string | string[] | number | undefined;
  send(body: unknown): FastifyReply;
  type(t: string): FastifyReply;
};

export const fastifyAdapter: RequestAdapter = {
  adaptRequest(raw): InertiaRequest {
    const r = raw as FastifyReq;
    const req: InertiaRequest = {
      method: r.method,
      originalUrl: r.raw?.originalUrl ?? r.url,
      url: r.url,
      header(name) {
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
    const r = raw as FastifyReply;
    const wrapper: InertiaResponse = {
      get statusCode() {
        return r.statusCode;
      },
      get headersSent() {
        return r.sent;
      },
      status(code) {
        r.code(code);
        return wrapper;
      },
      setHeader(name, value) {
        r.header(name, value);
        return wrapper;
      },
      getHeader(name) {
        return r.getHeader(name);
      },
      json(body) {
        r.send(body);
      },
      html(body) {
        r.header('Content-Type', 'text/html; charset=utf-8');
        r.send(body);
      },
      end() {
        r.send('');
      },
      raw,
    };
    return wrapper;
  },
};
