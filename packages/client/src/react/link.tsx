import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
import { Link as InertiaLink } from '@inertiajs/react';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { useInertiaRoutes } from './provider.js';

type AnyRoutes = RegistryRoutes;

// Optional/required routeParams based on whether the route has params
export type LinkProps<K extends keyof AnyRoutes> = Omit<
  ComponentProps<typeof InertiaLink>,
  'href'
> & {
  route: K;
  query?: Record<string, unknown>;
  children?: ReactNode;
} & (AnyRoutes[K] extends Record<string, never> | undefined // empty object means no params required
    ? { routeParams?: never }
    : { routeParams: AnyRoutes[K] });

export function Link<K extends keyof AnyRoutes & string>(props: LinkProps<K>) {
  const { route, routeParams, query, ...rest } = props;
  const resolveRoute = useInertiaRoutes();
  const href = resolveRoute(route, routeParams as Record<string, unknown> | undefined, query);
  return createElement(InertiaLink, { ...rest, href });
}
