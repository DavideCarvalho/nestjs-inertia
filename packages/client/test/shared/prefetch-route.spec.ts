/**
 * Tests for the framework-agnostic prefetch-route core shared by the React, Vue,
 * and Svelte adapters. It resolves a typed route to an href and delegates to the
 * injected Inertia `router.prefetch`.
 */
import { describe, expect, it, vi } from 'vitest';
import { runPrefetchRoute } from '../../src/shared/prefetch-route.js';

const mockResolve = (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => {
  const routes: Record<string, string> = {
    'users.list': '/api/users',
    'users.show': '/api/users/:id',
  };
  let path = routes[name] ?? `/${name}`;
  if (params) path = path.replace(/:([^/]+)/g, (_, k) => String(params[k]));
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const str = qs.toString();
    if (str) path += `?${str}`;
  }
  return path;
};

describe('runPrefetchRoute (shared core)', () => {
  it('resolves route params + query and forwards cacheFor to router.prefetch', () => {
    const prefetch = vi.fn();
    runPrefetchRoute({ prefetch }, mockResolve, 'users.show', {
      routeParams: { id: '7' },
      query: { tab: 'profile' },
      cacheFor: '30s',
    });
    expect(prefetch).toHaveBeenCalledTimes(1);
    const [href, visitOptions, prefetchOptions] = prefetch.mock.calls[0];
    expect(href).toBe('/api/users/7?tab=profile');
    expect(visitOptions).toEqual({ method: 'get' });
    expect(prefetchOptions).toEqual({ cacheFor: '30s' });
  });

  it('omits cacheFor when not provided', () => {
    const prefetch = vi.fn();
    runPrefetchRoute({ prefetch }, mockResolve, 'users.list');
    const [href, , prefetchOptions] = prefetch.mock.calls[0];
    expect(href).toBe('/api/users');
    expect(prefetchOptions).toEqual({});
  });
});
