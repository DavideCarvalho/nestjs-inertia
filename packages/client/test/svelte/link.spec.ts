/**
 * Tests for the typed Svelte <Link> component.
 *
 * We mock @inertiajs/svelte so tests don't need a full Inertia context.
 */
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRouteResolver } from '../../src/routes-stub.js';
import MockInertiaLink from './__mocks__/MockInertiaLink.svelte';

// Mock @inertiajs/svelte Link: renders a plain <a> forwarding href and slot
vi.mock('@inertiajs/svelte', () => ({
  Link: MockInertiaLink,
}));

// Import AFTER mocking
// biome-ignore lint: dynamic import after mock
const { Link } = await import('../../src/svelte/index.js');

function makeResolver(): (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => string {
  return (name, params, query) => {
    const routes: Record<string, string> = {
      'items.list': '/api/items',
      'items.show': '/api/items/:id',
    };
    let path = routes[name] ?? `/${name}`;
    if (params) {
      path = path.replace(/:([^/]+)/g, (_, key) => {
        const val = (params as Record<string, string>)[key];
        if (!val) throw new Error(`Missing param: ${key}`);
        return encodeURIComponent(val);
      });
    }
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
}

describe('Svelte Link component', () => {
  beforeEach(() => {
    setRouteResolver(makeResolver());
  });

  afterEach(() => {
    setRouteResolver(null);
    cleanup();
  });

  it('renders an anchor with computed href for a parameterless route', () => {
    const { getByTestId } = render(Link, { route: 'items.list' });
    const a = getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/items');
  });

  it('appends query params to the href', () => {
    const { getByTestId } = render(Link, {
      route: 'items.list',
      query: { active: 'true' },
    });
    const a = getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/items?active=true');
  });

  it('throws a clear error when setRouteResolver not called', () => {
    setRouteResolver(null);
    expect(() => render(Link, { route: 'items.list' })).toThrowError(
      '@dudousxd/nestjs-inertia-client: setRouteResolver() not called',
    );
  });
});

// ---------- type-level smoke tests ----------
describe('type smoke (runtime placeholder)', () => {
  it('compiles without error when routeParams is omitted for a parameterless route', () => {
    setRouteResolver(makeResolver());
    const result = render(Link, { route: 'items.list' });
    expect(result).toBeTruthy();
    setRouteResolver(null);
  });
});
