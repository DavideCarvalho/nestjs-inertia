/**
 * Tests for the typed <Link> component.
 *
 * We mock @inertiajs/react so tests don't need a full Inertia context.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @inertiajs/react Link: renders a plain <a> with all props forwarded
vi.mock('@inertiajs/react', () => ({
  Link: vi.fn(({ href, children, className, ...rest }: Record<string, unknown>) => (
    <a
      href={href as string}
      className={className as string | undefined}
      data-testid="inertia-link"
      {...rest}
    >
      {children}
    </a>
  )),
}));

// Import AFTER mocking
const { Link, InertiaRouteProvider } = await import('../../src/react/index.js');

function makeResolver() {
  return (name: string, params?: Record<string, unknown>, query?: Record<string, unknown>) => {
    const routes: Record<string, string> = {
      'users.list': '/api/users',
      'users.show': '/api/users/:id',
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

describe('Link component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an anchor with the computed href for a parameterless route', () => {
    render(
      <InertiaRouteProvider routes={makeResolver()}>
        <Link route="users.list">Users</Link>
      </InertiaRouteProvider>,
    );
    const a = screen.getByTestId('inertia-link');
    expect(a).toBeDefined();
    expect(a.getAttribute('href')).toBe('/api/users');
    expect(a.textContent).toBe('Users');
  });

  it('passes through className and other props', () => {
    render(
      <InertiaRouteProvider routes={makeResolver()}>
        <Link route="users.list" className="nav-link">
          Users
        </Link>
      </InertiaRouteProvider>,
    );
    const a = screen.getByTestId('inertia-link');
    expect(a.getAttribute('class')).toBe('nav-link');
  });

  it('appends query params to the href', () => {
    render(
      <InertiaRouteProvider routes={makeResolver()}>
        <Link route="users.list" query={{ active: 'true' }}>
          Active Users
        </Link>
      </InertiaRouteProvider>,
    );
    const a = screen.getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/users?active=true');
  });

  it('throws a clear error when InertiaRouteProvider is not in the tree', () => {
    expect(() => render(<Link route="users.list">Users</Link>)).toThrowError(
      '@dudousxd/nestjs-inertia-client: <InertiaRouteProvider> not found in the component tree',
    );
  });
});

// ---------- type-level smoke tests ----------
// These are compile-time assertions only; the test body is empty.
// They confirm the conditional type works correctly at the type level.
// We use the generic RegistryRoutes fallback (Record<string, unknown>),
// which means routeParams is always optional at this level.
describe('type smoke (runtime placeholder)', () => {
  it('compiles without error when routeParams is omitted for a parameterless route', () => {
    // This just asserts the JSX doesn't cause a type error.
    // The real typed check happens in the example app after codegen augments InertiaRegistry.
    const _jsx = (
      <InertiaRouteProvider routes={makeResolver()}>
        <Link route="some.route">text</Link>
      </InertiaRouteProvider>
    );
    expect(_jsx).toBeTruthy();
    cleanup();
  });
});
