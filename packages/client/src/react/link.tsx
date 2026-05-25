import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
/* v8 ignore next -- import resolution is not a branch */
import { Link as InertiaLink } from '@inertiajs/react';
import type { QueryClient } from '@tanstack/query-core';
import { type ComponentProps, type ReactNode, createElement, useCallback, useRef } from 'react';
import { useInertiaRoutes } from './provider.js';

type AnyRoutes = RegistryRoutes;

export interface PrefetchOptions {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

// Optional/required routeParams based on whether the route has params
export type LinkProps<K extends keyof AnyRoutes> = Omit<
  ComponentProps<typeof InertiaLink>,
  'href'
> & {
  route: K;
  query?: Record<string, unknown>;
  children?: ReactNode;
  /** Query options to prefetch on hover. Pass the result of `api.*.queryOptions()`. */
  prefetch?: PrefetchOptions;
  /** QueryClient instance required when `prefetch` is provided. */
  queryClient?: QueryClient;
} & (AnyRoutes[K] extends Record<string, never> | undefined // empty object means no params required
    ? { routeParams?: never }
    : { routeParams: AnyRoutes[K] });

export function Link<K extends keyof AnyRoutes & string>(props: LinkProps<K>) {
  const { route, routeParams, query, prefetch, queryClient, onMouseEnter, ...rest } = props;
  const resolveRoute = useInertiaRoutes();
  const href = resolveRoute(route, routeParams as Record<string, unknown> | undefined, query);

  const prefetchedRef = useRef(false);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (prefetch && queryClient && !prefetchedRef.current) {
        prefetchedRef.current = true;
        queryClient.prefetchQuery(prefetch);
      }
      if (onMouseEnter) {
        (onMouseEnter as (e: React.MouseEvent<HTMLAnchorElement>) => void)(e);
      }
    },
    [prefetch, queryClient, onMouseEnter],
  );

  return createElement(InertiaLink, { ...rest, href, onMouseEnter: handleMouseEnter });
}
