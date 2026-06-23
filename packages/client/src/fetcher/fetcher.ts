/* v8 ignore next 3 -- import resolution is not a branch */
import { ApiHttpError } from './errors.js';
import { getGlobalHeaders } from './global-headers.js';
import { buildUrl } from './url-builder.js';

export interface FetcherOptions {
  baseUrl?: string;
  /** Called once per request; allows dynamic auth tokens. */
  headers?: () => Record<string, string>;
  /** Injection seam for tests; default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Invoked with the error before it is re-thrown. */
  onError?: (err: ApiHttpError) => void;
  /**
   * Transforms the parsed JSON response body before it is returned. Applied
   * only to `application/json` responses (not the text fallback or SSE).
   * Serialization-agnostic seam: the `/superjson` subpath supplies
   * `superjson.deserialize` here to revive `Date`/`Map`/`Set` etc. Default
   * identity, so plain-JSON consumers are unaffected.
   */
  deserialize?: (raw: unknown) => unknown;
}

export interface Fetcher {
  get<T>(path: string, opts?: RequestOpts): Promise<T>;
  post<T>(path: string, opts?: RequestOpts): Promise<T>;
  put<T>(path: string, opts?: RequestOpts): Promise<T>;
  patch<T>(path: string, opts?: RequestOpts): Promise<T>;
  delete<T>(path: string, opts?: RequestOpts): Promise<T>;
  /**
   * Consume a server-sent-events (`@Sse()`) endpoint as a typed async stream.
   * Each yielded value is the JSON-parsed `data:` payload of one SSE event,
   * typed as `T` (the streamed element type the codegen carried through). The
   * stream ends when the connection closes; aborting the optional
   * {@link SseOpts.signal} stops it early.
   */
  sse<T>(path: string, opts?: SseOpts): AsyncIterable<T>;
}

/** Options for a streaming {@link Fetcher.sse} consumption. */
export interface SseOpts {
  params?: Record<string, unknown> | undefined;
  query?: Record<string, unknown> | undefined;
  /** Abort the stream early. */
  signal?: AbortSignal;
}

interface RequestOpts {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

function isFormData(b: unknown): b is FormData {
  return typeof FormData !== 'undefined' && b instanceof FormData;
}

export function createFetcher(opts: FetcherOptions = {}): Fetcher {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? '';

  async function request<T>(method: string, path: string, ro: RequestOpts = {}): Promise<T> {
    if (!fetchImpl) {
      throw new Error('No fetch implementation: pass opts.fetch or set globalThis.fetch');
    }
    const url = buildUrl(path, ro, baseUrl);
    const headers: Record<string, string> = { ...getGlobalHeaders(), ...opts.headers?.() };
    let body: string | FormData | undefined = undefined;

    if (ro.body !== undefined) {
      if (isFormData(ro.body)) {
        body = ro.body;
        // Do NOT set Content-Type — the runtime sets it with the multipart boundary
      } else {
        body = JSON.stringify(ro.body);
        headers['content-type'] = 'application/json';
      }
    }

    if (!headers.accept) {
      headers.accept = 'application/json';
    }

    const res = await fetchImpl(url, { method, headers, ...(body !== undefined ? { body } : {}) });

    if (!res.ok) {
      const err = await ApiHttpError.fromResponse(res);
      opts.onError?.(err);
      throw err;
    }

    if (res.status === 204) return undefined as T;

    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const raw = (await res.json()) as unknown;
      return (opts.deserialize ? opts.deserialize(raw) : raw) as T;
    }
    return (await res.text()) as unknown as T;
  }

  function sse<T>(path: string, so: SseOpts = {}): AsyncIterable<T> {
    const url = buildUrl(
      path,
      { ...(so.params ? { params: so.params } : {}), ...(so.query ? { query: so.query } : {}) },
      baseUrl,
    );
    const headers: Record<string, string> = {
      ...getGlobalHeaders(),
      ...opts.headers?.(),
      accept: 'text/event-stream',
    };
    return consumeSse<T>(fetchImpl, url, headers, so.signal);
  }

  return {
    get: <T>(p: string, ro?: RequestOpts) => request<T>('GET', p, ro),
    post: <T>(p: string, ro?: RequestOpts) => request<T>('POST', p, ro),
    put: <T>(p: string, ro?: RequestOpts) => request<T>('PUT', p, ro),
    patch: <T>(p: string, ro?: RequestOpts) => request<T>('PATCH', p, ro),
    delete: <T>(p: string, ro?: RequestOpts) => request<T>('DELETE', p, ro),
    sse,
  };
}

/**
 * Consume a `text/event-stream` response as an async iterable of parsed `data:`
 * payloads. Parses the SSE wire format (events separated by a blank line, `data:`
 * lines concatenated) and JSON-parses each event's data. Bring-your-own-`fetch`
 * so it works in any runtime.
 */
export async function* consumeSse<T>(
  fetchImpl: typeof fetch | undefined,
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): AsyncIterable<T> {
  if (!fetchImpl) {
    throw new Error('No fetch implementation: pass opts.fetch or set globalThis.fetch');
  }
  const res = await fetchImpl(url, {
    method: 'GET',
    headers,
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const err = await ApiHttpError.fromResponse(res);
    throw err;
  }
  const body = res.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Events are separated by a blank line.
      let sep = buf.indexOf('\n\n');
      while (sep !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = parseEventData(raw);
        if (data !== null) yield JSON.parse(data) as T;
        sep = buf.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Extract and concatenate the `data:` lines of one SSE event block. */
function parseEventData(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  return dataLines.length > 0 ? dataLines.join('\n') : null;
}
