/**
 * Tests for Svelte provider functions (provideInertiaRoutes / useInertiaRoutes).
 *
 * We mock the `svelte` module to avoid needing a real Svelte component context.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// In-memory context store used by the mock
const contextStore = new Map<string, unknown>();

vi.mock('svelte', () => ({
  getContext: (key: string) => contextStore.get(key),
  setContext: (key: string, value: unknown) => contextStore.set(key, value),
}));

// Import AFTER mocking
const { provideInertiaRoutes, useInertiaRoutes } = await import('../../src/svelte/provider.js');

describe('provideInertiaRoutes', () => {
  afterEach(() => {
    contextStore.clear();
  });

  it('stores the resolver so useInertiaRoutes can retrieve it', () => {
    const resolver = () => '/test';
    provideInertiaRoutes(resolver);
    const retrieved = useInertiaRoutes();
    expect(retrieved).toBe(resolver);
    expect(retrieved()).toBe('/test');
  });
});

describe('useInertiaRoutes', () => {
  afterEach(() => {
    contextStore.clear();
  });

  it('throws when provideInertiaRoutes was not called', () => {
    expect(() => useInertiaRoutes()).toThrowError(
      '@dudousxd/nestjs-inertia-client: provideInertiaRoutes() not called',
    );
  });

  it('returns the resolver when it was provided', () => {
    const resolver = (name: string) => `/api/${name}`;
    provideInertiaRoutes(resolver);
    const result = useInertiaRoutes();
    expect(result('users')).toBe('/api/users');
  });
});
