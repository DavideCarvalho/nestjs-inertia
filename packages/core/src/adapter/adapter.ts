export interface InertiaRequest {
  method: string;
  originalUrl: string;
  url: string;
  header(name: string): string | undefined;
  body?: unknown;
  query?: Record<string, unknown>;
  raw: unknown;
}

export interface InertiaResponse {
  statusCode: number;
  headersSent: boolean;
  status(code: number): InertiaResponse;
  setHeader(name: string, value: string): InertiaResponse;
  getHeader(name: string): string | string[] | number | undefined;
  json(body: unknown): void;
  html(body: string): void;
  end(): void;
  raw: unknown;
}

export interface RequestAdapter {
  adaptRequest(raw: unknown): InertiaRequest;
  adaptResponse(raw: unknown): InertiaResponse;
}
