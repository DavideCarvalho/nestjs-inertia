import { describe, it, expectTypeOf } from 'vitest';
import type { InertiaRequest, InertiaResponse } from '../src/adapter/adapter.js';

describe('adapter interface', () => {
  it('InertiaRequest has minimum surface', () => {
    expectTypeOf<InertiaRequest>().toMatchTypeOf<{
      method: string;
      originalUrl: string;
      header: (name: string) => string | undefined;
      raw: unknown;
      body?: unknown;
      query?: Record<string, unknown>;
    }>();
  });

  it('InertiaResponse has minimum surface', () => {
    expectTypeOf<InertiaResponse['status']>().toMatchTypeOf<(code: number) => InertiaResponse>();
    expectTypeOf<InertiaResponse['setHeader']>().toMatchTypeOf<(name: string, value: string) => InertiaResponse>();
    expectTypeOf<InertiaResponse['json']>().toMatchTypeOf<(body: unknown) => void>();
    expectTypeOf<InertiaResponse['html']>().toMatchTypeOf<(body: string) => void>();
    expectTypeOf<InertiaResponse['end']>().toMatchTypeOf<() => void>();
  });
});
