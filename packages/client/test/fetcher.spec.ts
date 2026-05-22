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
