import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import superjson from 'superjson';
import { describe, expect, it } from 'vitest';
import { createFetcher } from '../src/fetcher/fetcher.js';
import {
  SUPERJSON_HEADER,
  SuperjsonInterceptor,
  superjsonFetcherOptions,
  withSuperjson,
} from '../src/superjson/index.js';

/** Minimal ExecutionContext exposing only the request headers the interceptor reads. */
function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

/** CallHandler whose handle() emits the given payload once. */
function makeNext(payload: unknown): CallHandler {
  return { handle: () => of(payload) };
}

describe('SuperjsonInterceptor (content negotiation)', () => {
  it('WITH x-superjson header → response is superjson-serialized ({json,meta}), Dates revive', async () => {
    const interceptor = new SuperjsonInterceptor();
    const now = new Date('2024-01-02T03:04:05.000Z');
    const payload = { when: now, tag: 'hi' };

    const result = (await firstValueFrom(
      interceptor.intercept(makeContext({ [SUPERJSON_HEADER]: '1' }), makeNext(payload)),
    )) as { json: unknown; meta: unknown };

    // Envelope shape, not the raw object.
    expect(result).toHaveProperty('json');
    expect(result).toHaveProperty('meta');
    expect((result.json as { when: unknown }).when).toBe(now.toISOString());

    // Round-trips back to a real Date via superjson.deserialize.
    const revived = superjson.deserialize<typeof payload>(
      result as Parameters<typeof superjson.deserialize>[0],
    );
    expect(revived.when).toBeInstanceOf(Date);
    expect(revived.when.getTime()).toBe(now.getTime());
    expect(revived.tag).toBe('hi');
  });

  it('WITHOUT x-superjson header → plain object passthrough (no envelope)', async () => {
    const interceptor = new SuperjsonInterceptor();
    const payload = { when: new Date('2024-01-02T03:04:05.000Z'), tag: 'hi' };

    const result = await firstValueFrom(interceptor.intercept(makeContext({}), makeNext(payload)));

    expect(result).toBe(payload);
    expect(result).not.toHaveProperty('meta');
  });

  it('x-superjson header with a non-"1" value is treated as opt-out', async () => {
    const interceptor = new SuperjsonInterceptor();
    const payload = { tag: 'hi' };

    const result = await firstValueFrom(
      interceptor.intercept(makeContext({ [SUPERJSON_HEADER]: '0' }), makeNext(payload)),
    );

    expect(result).toBe(payload);
  });
});

describe('superjsonFetcherOptions', () => {
  it('sends the x-superjson opt-in header', () => {
    const opts = superjsonFetcherOptions();
    expect(opts.headers?.()).toEqual({ [SUPERJSON_HEADER]: '1' });
  });

  it('round-trips a superjson envelope through the fetcher deserialize hook into a real Date', async () => {
    const now = new Date('2024-05-06T07:08:09.000Z');
    const envelope = superjson.serialize({ when: now });
    const fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as unknown as typeof globalThis.fetch;

    const fetcher = createFetcher({ fetch, ...superjsonFetcherOptions() });
    const result = (await fetcher.get('/thing')) as { when: Date };
    expect(result.when).toBeInstanceOf(Date);
    expect(result.when.getTime()).toBe(now.getTime());
  });
});

describe('withSuperjson', () => {
  it('composes caller headers with the superjson opt-in header', () => {
    const merged = withSuperjson({ headers: () => ({ authorization: 'Bearer tok' }) });
    expect(merged.headers?.()).toEqual({
      authorization: 'Bearer tok',
      [SUPERJSON_HEADER]: '1',
    });
    expect(merged.deserialize).toBeTypeOf('function');
  });
});
