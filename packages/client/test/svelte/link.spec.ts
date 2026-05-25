/**
 * Tests for the typed Svelte <Link> component.
 *
 * We mock @inertiajs/svelte so tests don't need a full Inertia context.
 */
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MockInertiaLink from './__mocks__/MockInertiaLink.svelte';

// Mock @inertiajs/svelte Link: renders a plain <a> forwarding href and slot
vi.mock('@inertiajs/svelte', () => ({
  Link: MockInertiaLink,
}));

// Import AFTER mocking
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

// Svelte 5 mount accepts a `context` Map — @testing-library/svelte passes it through
function contextWith(resolver: ReturnType<typeof makeResolver>) {
  return new Map([['inertia-routes', resolver]]);
}

describe('Svelte Link component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an anchor with computed href for a parameterless route', () => {
    const { getByTestId } = render(Link, {
      props: { route: 'items.list' },
      context: contextWith(makeResolver()),
    });
    const a = getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/items');
  });

  it('appends query params to the href', () => {
    const { getByTestId } = render(Link, {
      props: { route: 'items.list', query: { active: 'true' } },
      context: contextWith(makeResolver()),
    });
    const a = getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/items?active=true');
  });

  it('throws a clear error when provideInertiaRoutes not called', () => {
    expect(() => render(Link, { props: { route: 'items.list' } })).toThrowError(
      '@dudousxd/nestjs-inertia-client: provideInertiaRoutes() not called',
    );
  });
});

// ---------- prefetch-on-hover tests ----------
describe('Svelte Link prefetch on hover', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls queryClient.prefetchQuery on mouseenter when prefetch is provided', async () => {
    const prefetchQuery = vi.fn();
    const queryClient = { prefetchQuery } as unknown as import('@tanstack/query-core').QueryClient;
    const prefetchOpts = {
      queryKey: ['items', 'list'] as const,
      queryFn: () => Promise.resolve([{ id: 1 }]),
    };

    const { container } = render(Link, {
      props: { route: 'items.list', prefetch: prefetchOpts, queryClient },
      context: contextWith(makeResolver()),
    });
    const span = container.querySelector('span')!;
    const event = new MouseEvent('mouseenter', { bubbles: true });
    span.dispatchEvent(event);

    expect(prefetchQuery).toHaveBeenCalledTimes(1);
    expect(prefetchQuery).toHaveBeenCalledWith(prefetchOpts);
  });

  it('only prefetches once even after multiple hovers', async () => {
    const prefetchQuery = vi.fn();
    const queryClient = { prefetchQuery } as unknown as import('@tanstack/query-core').QueryClient;
    const prefetchOpts = {
      queryKey: ['items', 'list'] as const,
      queryFn: () => Promise.resolve([]),
    };

    const { container } = render(Link, {
      props: { route: 'items.list', prefetch: prefetchOpts, queryClient },
      context: contextWith(makeResolver()),
    });
    const span = container.querySelector('span')!;
    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(prefetchQuery).toHaveBeenCalledTimes(1);
  });

  it('does not prefetch when prefetch prop is not provided', async () => {
    const prefetchQuery = vi.fn();
    const queryClient = { prefetchQuery } as unknown as import('@tanstack/query-core').QueryClient;

    const { container } = render(Link, {
      props: { route: 'items.list', queryClient },
      context: contextWith(makeResolver()),
    });
    const span = container.querySelector('span')!;
    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(prefetchQuery).not.toHaveBeenCalled();
  });
});

// ---------- type-level smoke tests ----------
describe('type smoke (runtime placeholder)', () => {
  it('compiles without error when routeParams is omitted for a parameterless route', () => {
    const result = render(Link, {
      props: { route: 'items.list' },
      context: contextWith(makeResolver()),
    });
    expect(result).toBeTruthy();
  });
});
