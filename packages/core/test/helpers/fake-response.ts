import type { InertiaResponse } from '../../src/adapter/adapter.js';

export function fakeResponse(): InertiaResponse & {
  _captured: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    bodyHtml?: string;
    ended: boolean;
    chunks: string[];
    streamed: boolean;
  };
} {
  const captured = {
    status: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    bodyHtml: undefined as string | undefined,
    ended: false,
    chunks: [] as string[],
    streamed: false,
  };
  let sent = false;
  const res = {
    get statusCode() {
      return captured.status;
    },
    get headersSent() {
      return sent;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
      return res;
    },
    getHeader(name: string) {
      return captured.headers[name];
    },
    json(body: unknown) {
      captured.body = body;
      sent = true;
    },
    html(body: string) {
      captured.bodyHtml = body;
      sent = true;
    },
    htmlStream(initialChunk: string) {
      captured.streamed = true;
      captured.chunks.push(initialChunk);
      sent = true;
      return {
        write(chunk: string) {
          captured.chunks.push(chunk);
          return true;
        },
        end(chunk?: string) {
          if (chunk !== undefined) captured.chunks.push(chunk);
          captured.ended = true;
          captured.bodyHtml = captured.chunks.join('');
        },
      };
    },
    end() {
      captured.ended = true;
      sent = true;
    },
    raw: {},
    _captured: captured,
  };
  return res as InertiaResponse & typeof res;
}
