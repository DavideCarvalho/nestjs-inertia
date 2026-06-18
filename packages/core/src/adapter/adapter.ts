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
  /**
   * Begin a streamed HTML response: sets the content-type and writes the first
   * chunk, returning a {@link InertiaHtmlStream} for the remaining chunks. Used
   * by the streaming SSR path so the shell head can be flushed before the app
   * body has finished rendering.
   */
  htmlStream(initialChunk: string): InertiaHtmlStream;
  raw: unknown;
}

/** A progressive HTML response handle returned by {@link InertiaResponse.htmlStream}. */
export interface InertiaHtmlStream {
  write(chunk: string): boolean;
  end(chunk?: string): void;
}

export interface RequestAdapter {
  adaptRequest(raw: unknown): InertiaRequest;
  adaptResponse(raw: unknown): InertiaResponse;
}
