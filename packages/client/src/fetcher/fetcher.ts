import { buildUrl } from './url-builder.js';
import { ApiHttpError } from './errors.js';

export interface FetcherOptions {
  baseUrl?: string;
  /** Called once per request; allows dynamic auth tokens. */
  headers?: () => Record<string, string>;
  /** Injection seam for tests; default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Invoked with the error before it is re-thrown. */
  onError?: (err: ApiHttpError) => void;
}

export interface Fetcher {
  get<T>(path: string, opts?: RequestOpts): Promise<T>;
  post<T>(path: string, opts?: RequestOpts): Promise<T>;
  put<T>(path: string, opts?: RequestOpts): Promise<T>;
  patch<T>(path: string, opts?: RequestOpts): Promise<T>;
  delete<T>(path: string, opts?: RequestOpts): Promise<T>;
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
    const url = buildUrl(path, ro, baseUrl);
    const headers: Record<string, string> = { ...opts.headers?.() };
    let body: BodyInit | undefined;

    if (ro.body !== undefined) {
      if (isFormData(ro.body)) {
        body = ro.body;
        // Do NOT set Content-Type — the runtime sets it with the multipart boundary
      } else {
        body = JSON.stringify(ro.body);
        headers['content-type'] = 'application/json';
      }
    }

    if (!headers['accept']) {
      headers['accept'] = 'application/json';
    }

    const res = await fetchImpl(url, { method, headers, body });

    if (!res.ok) {
      const err = await ApiHttpError.fromResponse(res);
      opts.onError?.(err);
      throw err;
    }

    if (res.status === 204) return undefined as T;

    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  return {
    get:    <T>(p: string, ro?: RequestOpts) => request<T>('GET',    p, ro),
    post:   <T>(p: string, ro?: RequestOpts) => request<T>('POST',   p, ro),
    put:    <T>(p: string, ro?: RequestOpts) => request<T>('PUT',    p, ro),
    patch:  <T>(p: string, ro?: RequestOpts) => request<T>('PATCH',  p, ro),
    delete: <T>(p: string, ro?: RequestOpts) => request<T>('DELETE', p, ro),
  };
}
