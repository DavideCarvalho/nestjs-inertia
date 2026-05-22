import { afterEach, describe, expect, it, vi } from 'vitest';
import { route, setRouteResolver } from '../../src/routes-stub.js';

describe('routes-stub', () => {
  afterEach(() => {
    // Reset resolver between tests
    setRouteResolver(null);
  });

  it('throws a clear error when no resolver has been set', () => {
    expect(() => route('users.list')).toThrowError(
      '@dudousxd/nestjs-inertia-client: setRouteResolver() not called',
    );
  });

  it('delegates to resolver when set', () => {
    const fn = vi.fn().mockReturnValue('/api/users');
    setRouteResolver(fn);
    expect(route('users.list')).toBe('/api/users');
    expect(fn).toHaveBeenCalledWith('users.list', undefined, undefined);
  });

  it('passes params and query to resolver', () => {
    const fn = vi.fn().mockReturnValue('/api/users/42');
    setRouteResolver(fn);
    expect(route('users.show', { id: '42' }, { active: true })).toBe('/api/users/42');
    expect(fn).toHaveBeenCalledWith('users.show', { id: '42' }, { active: true });
  });

  it('replaces resolver when setRouteResolver is called again', () => {
    const first = vi.fn().mockReturnValue('/first');
    const second = vi.fn().mockReturnValue('/second');
    setRouteResolver(first);
    expect(route('a')).toBe('/first');
    setRouteResolver(second);
    expect(route('a')).toBe('/second');
  });
});
