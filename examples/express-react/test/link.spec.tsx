/**
 * React-level unit test for the typed <Link> component wired to the actual
 * generated route() function.
 *
 * This test confirms:
 *  - InertiaRouteProvider + the generated route() function work together
 *  - <Link route="users.list"> renders an anchor with href="/api/users"
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Mock @inertiajs/react Link so we don't need a full Inertia context in unit tests
vi.mock('@inertiajs/react', () => ({
  Link: vi.fn(
    ({
      href,
      children,
      ...rest
    }: { href: string; children: ReactNode } & Record<string, unknown>) => (
      <a href={href} data-testid="inertia-link" {...rest}>
        {children}
      </a>
    ),
  ),
}));

const { Link, InertiaRouteProvider } = await import('@dudousxd/nestjs-inertia-client/react');
const { route } = await import('../.nestjs-inertia/routes.js');

describe('Link + generated route()', () => {
  afterAll(() => {
    cleanup();
  });

  it('renders href="/api/users" for route "users.list"', () => {
    render(
      <InertiaRouteProvider routes={route}>
        <Link route="users.list">Users</Link>
      </InertiaRouteProvider>,
    );
    const a = screen.getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/api/users');
    expect(a.textContent).toBe('Users');
    cleanup();
  });

  it('renders href="/dashboard" for DashboardController.index', () => {
    render(
      <InertiaRouteProvider routes={route}>
        <Link route="DashboardController.index">Dashboard</Link>
      </InertiaRouteProvider>,
    );
    const a = screen.getByTestId('inertia-link');
    expect(a.getAttribute('href')).toBe('/dashboard');
    cleanup();
  });
});
