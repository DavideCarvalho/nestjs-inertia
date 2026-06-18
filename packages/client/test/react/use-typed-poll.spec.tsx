/**
 * Tests for the native polling / prefetch helpers.
 *
 * These wrap Inertia v2's native `usePoll` hook and `router.prefetch`, adding a
 * type layer keyed by page prop names (`only` / `except`). We mock
 * @inertiajs/react so tests run without an Inertia context.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePoll = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
const mockPrefetch = vi.fn();
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

vi.mock('@inertiajs/react', () => ({
  usePoll: (...args: unknown[]) => mockUsePoll(...(args as [])),
  router: {
    prefetch: (...args: unknown[]) => mockPrefetch(...(args as [])),
  },
}));

// Import AFTER mocking
const { useTypedPoll, prefetchRoute } = await import('../../src/react/index.js');

describe('useTypedPoll (React)', () => {
  it('forwards interval and reload options to usePoll', () => {
    mockUsePoll.mockClear();
    renderHook(() => useTypedPoll(2000, { only: ['users'] }));
    expect(mockUsePoll).toHaveBeenCalledTimes(1);
    const [interval, reloadOpts] = mockUsePoll.mock.calls[0];
    expect(interval).toBe(2000);
    expect(reloadOpts).toEqual({ only: ['users'], except: undefined });
  });

  it('forwards except and poll options', () => {
    mockUsePoll.mockClear();
    renderHook(() => useTypedPoll(5000, { except: ['stats'] }, { autoStart: false }));
    const [interval, reloadOpts, pollOpts] = mockUsePoll.mock.calls[0];
    expect(interval).toBe(5000);
    expect(reloadOpts).toEqual({ only: undefined, except: ['stats'] });
    expect(pollOpts).toEqual({ autoStart: false });
  });

  it('returns the start/stop controls from usePoll', () => {
    mockUsePoll.mockClear();
    const { result } = renderHook(() => useTypedPoll(1000));
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
  });
});

describe('prefetchRoute (React)', () => {
  it('resolves a route href and calls router.prefetch with cacheFor', () => {
    mockPrefetch.mockClear();
    prefetchRoute(mockResolve, 'users.show', {
      routeParams: { id: '7' },
      cacheFor: '30s',
    });
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    const [href, visitOptions, prefetchOptions] = mockPrefetch.mock.calls[0];
    expect(href).toBe('/api/users/7');
    expect(visitOptions).toEqual({ method: 'get' });
    expect(prefetchOptions).toEqual({ cacheFor: '30s' });
  });

  it('works for a parameterless route and defaults cacheFor when omitted', () => {
    mockPrefetch.mockClear();
    prefetchRoute(mockResolve, 'users.list');
    const [href, , prefetchOptions] = mockPrefetch.mock.calls[0];
    expect(href).toBe('/api/users');
    expect(prefetchOptions).toEqual({});
  });

  it('forwards query params and staleTime via cacheFor array', () => {
    mockPrefetch.mockClear();
    prefetchRoute(mockResolve, 'users.list', {
      query: { active: 'true' },
      cacheFor: ['10s', '1m'],
    });
    const [href, , prefetchOptions] = mockPrefetch.mock.calls[0];
    expect(href).toBe('/api/users?active=true');
    expect(prefetchOptions).toEqual({ cacheFor: ['10s', '1m'] });
  });
});
