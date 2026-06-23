import { describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '../src/fetcher/errors.js';
import { createFetcher } from '../src/fetcher/fetcher.js';

/** Build a minimal fetch mock that returns a given Response. */
function mockFetch(res: Response): typeof fetch {
  return vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
}

describe('createFetcher', () => {
  it('GET request to relative path returns parsed JSON', async () => {
    const payload = [{ id: '1' }];
    const f = mockFetch(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    const result = await fetcher.get('/users');
    expect(result).toEqual(payload);
    expect(vi.mocked(f)).toHaveBeenCalledWith('/users', expect.objectContaining({ method: 'GET' }));
  });

  it('POST request with body serializes JSON + sets Content-Type', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({ id: '2' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    await fetcher.post('/users', { body: { name: 'Alice' } });
    const [, init] = vi.mocked(f).mock.calls[0]!;
    expect(init?.body).toBe(JSON.stringify({ name: 'Alice' }));
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('4xx throws ApiHttpError', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({ message: 'not found' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    await expect(fetcher.get('/missing')).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('204 No Content returns undefined', async () => {
    const f = mockFetch(new Response(null, { status: 204 }));
    const fetcher = createFetcher({ fetch: f });
    const result = await fetcher.delete('/users/1');
    expect(result).toBeUndefined();
  });

  it('per-request headers from headers() option propagate', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({
      fetch: f,
      headers: () => ({ Authorization: 'Bearer tok' }),
    });
    await fetcher.get('/me');
    const [, init] = vi.mocked(f).mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('onError callback fires on error', async () => {
    const f = mockFetch(new Response(null, { status: 500, statusText: 'Internal Server Error' }));
    const onError = vi.fn();
    const fetcher = createFetcher({ fetch: f, onError });
    await expect(fetcher.get('/boom')).rejects.toBeInstanceOf(ApiHttpError);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(ApiHttpError);
  });

  it('supports PUT, PATCH, DELETE HTTP methods', async () => {
    const methods = ['put', 'patch', 'delete'] as const;
    for (const method of methods) {
      const f = mockFetch(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const fetcher = createFetcher({ fetch: f });
      await fetcher[method]('/resource/1');
      const [, init] = vi.mocked(f).mock.calls[0]!;
      expect(init?.method).toBe(method.toUpperCase());
    }
  });

  it('dynamic headers() is called per request', async () => {
    const headersFn = vi.fn().mockReturnValue({ 'x-req': 'yes' });
    // Use mockImplementation so each call gets a fresh Response (body can only be read once)
    const f = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;
    const fetcher = createFetcher({ fetch: f, headers: headersFn });
    await fetcher.get('/a');
    await fetcher.get('/b');
    expect(headersFn).toHaveBeenCalledTimes(2);
  });

  it('POST with FormData body does NOT set Content-Type (runtime sets boundary)', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    const form = new FormData();
    form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt');
    await fetcher.post('/upload', { body: form });
    const [, init] = vi.mocked(f).mock.calls[0]!;
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('throws clearly when globalThis.fetch is undefined and no opts.fetch is provided', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // @ts-expect-error — intentionally unset for SSR simulation
      globalThis.fetch = undefined;
      const fetcher = createFetcher();
      await expect(fetcher.get('/anything')).rejects.toThrow(
        'No fetch implementation: pass opts.fetch or set globalThis.fetch',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns text when content-type is not application/json', async () => {
    const f = mockFetch(
      new Response('plain text response', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    const result = await fetcher.get<string>('/text');
    expect(result).toBe('plain text response');
  });

  it('returns text when content-type header is absent', async () => {
    const f = mockFetch(new Response('no ct body', { status: 200 }));
    const fetcher = createFetcher({ fetch: f });
    const result = await fetcher.get<string>('/no-ct');
    expect(result).toBe('no ct body');
  });

  it('sets default accept header to application/json', async () => {
    const f = mockFetch(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetcher = createFetcher({ fetch: f });
    await fetcher.get('/test');
    const [, init] = vi.mocked(f).mock.calls[0]!;
    expect((init?.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('does not override accept header from headers()', async () => {
    const f = mockFetch(
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const fetcher = createFetcher({
      fetch: f,
      headers: () => ({ accept: 'text/html' }),
    });
    await fetcher.get('/page');
    const [, init] = vi.mocked(f).mock.calls[0]!;
    expect((init?.headers as Record<string, string>).accept).toBe('text/html');
  });

  it('dynamic headers() call count matches number of requests', async () => {
    const headersFn = vi.fn().mockReturnValue({ 'x-custom': 'val' });
    const f = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;
    const fetcher = createFetcher({ fetch: f, headers: headersFn });
    await fetcher.get('/x');
    await fetcher.post('/y', { body: { a: 1 } });
    await fetcher.delete('/z');
    expect(headersFn).toHaveBeenCalledTimes(3);
  });
});

describe('fetcher.sse — server-sent events streaming', () => {
  function sseResponse(chunks: string[], status = 200): Response {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    return new Response(stream, {
      status,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  it('yields JSON-parsed data payloads as a typed async iterable', async () => {
    const f = vi.fn(async () =>
      sseResponse(['data: {"count":1}\n\n', 'data: {"count":2}\n\n']),
    ) as unknown as typeof fetch;
    const fetcher = createFetcher({ fetch: f });
    const seen: number[] = [];
    for await (const ev of fetcher.sse<{ count: number }>('/events')) {
      seen.push(ev.count);
    }
    expect(seen).toEqual([1, 2]);
    // accept header negotiates the event-stream content type
    expect((vi.mocked(f).mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      accept: 'text/event-stream',
    });
  });

  it('handles events split across chunk boundaries', async () => {
    const f = vi.fn(async () =>
      sseResponse(['data: {"co', 'unt":7}\n\n']),
    ) as unknown as typeof fetch;
    const fetcher = createFetcher({ fetch: f });
    const seen: number[] = [];
    for await (const ev of fetcher.sse<{ count: number }>('/events')) {
      seen.push(ev.count);
    }
    expect(seen).toEqual([7]);
  });

  it('throws ApiHttpError on a non-ok response', async () => {
    const f = mockFetch(
      new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }),
    );
    const fetcher = createFetcher({ fetch: f });
    await expect(async () => {
      for await (const _ of fetcher.sse('/events')) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('forwards the abort signal to fetch and stops early', async () => {
    const controller = new AbortController();
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      // Abort immediately so the consumer rejects rather than streaming.
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return sseResponse(['data: {"count":1}\n\n']);
    }) as unknown as typeof fetch;
    controller.abort();
    const fetcher = createFetcher({ fetch: f });
    await expect(async () => {
      for await (const _ of fetcher.sse('/events', { signal: controller.signal })) {
        // unreachable
      }
    }).rejects.toThrow();
    expect((vi.mocked(f).mock.calls[0]?.[1] as RequestInit).signal).toBe(controller.signal);
  });

  it('throws clearly when no fetch implementation is available', async () => {
    const originalFetch = globalThis.fetch;
    try {
      // @ts-expect-error — intentionally unset for SSR simulation
      globalThis.fetch = undefined;
      const fetcher = createFetcher();
      await expect(async () => {
        for await (const _ of fetcher.sse('/events')) {
          // unreachable
        }
      }).rejects.toThrow('No fetch implementation: pass opts.fetch or set globalThis.fetch');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
