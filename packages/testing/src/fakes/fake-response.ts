export interface FakeInertiaResponse {
  statusCode: number;
  headersSent: boolean;
  status(code: number): FakeInertiaResponse;
  setHeader(name: string, value: string): FakeInertiaResponse;
  getHeader(name: string): string | string[] | number | undefined;
  json(body: unknown): void;
  html(body: string): void;
  end(): void;
  raw: unknown;
  _captured: { status: number; headers: Record<string, string>; body?: unknown; bodyHtml?: string; ended: boolean };
}

export function createFakeInertiaResponse(): FakeInertiaResponse {
  const captured = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown, bodyHtml: undefined as string | undefined, ended: false };
  let sent = false;
  const res: FakeInertiaResponse = {
    get statusCode() { return captured.status; },
    get headersSent() { return sent; },
    status(code: number) { captured.status = code; return res; },
    setHeader(name: string, value: string) { captured.headers[name] = value; return res; },
    getHeader(name: string) { return captured.headers[name]; },
    json(body: unknown) { captured.body = body; sent = true; },
    html(body: string) { captured.bodyHtml = body; sent = true; },
    end() { captured.ended = true; sent = true; },
    raw: {},
    _captured: captured,
  };
  return res;
}
