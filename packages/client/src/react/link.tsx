import { Link as InertiaLink } from '@inertiajs/react';
import type { ComponentProps, ReactNode } from 'react';
import { route as buildRoute } from '../routes-stub.js';
import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';

type AnyRoutes = RegistryRoutes;

// Optional/required routeParams based on whether the route has params
export type LinkProps<K extends keyof AnyRoutes> = Omit<
  ComponentProps<typeof InertiaLink>,
  'href'
> & {
  route: K;
  query?: Record<string, unknown>;
  children?: ReactNode;
} & (
    // empty object means no params required
    AnyRoutes[K] extends Record<string, never> | undefined
      ? { routeParams?: never }
      : { routeParams: AnyRoutes[K] }
  );

export function Link<K extends keyof AnyRoutes & string>(props: LinkProps<K>) {
  const { route, routeParams, query, ...rest } = props;
  const href = buildRoute(
    route,
    routeParams as Record<string, unknown> | undefined,
    query,
  );
  return <InertiaLink {...rest} href={href} />;
}
