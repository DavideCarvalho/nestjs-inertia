/**
 * Tests for the React context-based route provider.
 *
 * Replaces the old routes-stub tests now that setRouteResolver has been removed.
 */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InertiaRouteProvider, useInertiaRoutes } from '../../src/react/index.js';

describe('useInertiaRoutes hook', () => {
  afterEach(() => {
    cleanup();
  });

  it('throws a clear error when provider is not in the tree', () => {
    expect(() => {
      renderHook(() => useInertiaRoutes());
    }).toThrowError('@dudousxd/nestjs-inertia-client: <InertiaRouteProvider> not found');
  });

  it('returns the resolver when provider is present', () => {
    const mockResolver = vi.fn().mockReturnValue('/api/users');
    const { result } = renderHook(() => useInertiaRoutes(), {
      wrapper: ({ children }) => (
        <InertiaRouteProvider routes={mockResolver}>{children}</InertiaRouteProvider>
      ),
    });
    const resolve = result.current;
    expect(typeof resolve).toBe('function');
    resolve('users.list', undefined, undefined);
    expect(mockResolver).toHaveBeenCalledWith('users.list', undefined, undefined);
  });

  it('passes params and query to resolver', () => {
    const mockResolver = vi.fn().mockReturnValue('/api/users/42');
    const { result } = renderHook(() => useInertiaRoutes(), {
      wrapper: ({ children }) => (
        <InertiaRouteProvider routes={mockResolver}>{children}</InertiaRouteProvider>
      ),
    });
    result.current('users.show', { id: '42' }, { active: 'true' });
    expect(mockResolver).toHaveBeenCalledWith('users.show', { id: '42' }, { active: 'true' });
  });

  it('returns different resolvers when provider changes', () => {
    const first = vi.fn().mockReturnValue('/first');
    const second = vi.fn().mockReturnValue('/second');

    const { result: r1 } = renderHook(() => useInertiaRoutes(), {
      wrapper: ({ children }) => (
        <InertiaRouteProvider routes={first}>{children}</InertiaRouteProvider>
      ),
    });
    expect(r1.current('a')).toBe('/first');

    const { result: r2 } = renderHook(() => useInertiaRoutes(), {
      wrapper: ({ children }) => (
        <InertiaRouteProvider routes={second}>{children}</InertiaRouteProvider>
      ),
    });
    expect(r2.current('a')).toBe('/second');
  });
});
