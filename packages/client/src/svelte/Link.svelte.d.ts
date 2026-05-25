import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
import type { QueryClient } from '@tanstack/query-core';
import type { SvelteComponent } from 'svelte';

type Routes = RegistryRoutes;

export interface PrefetchOptions {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

export interface LinkProps<K extends keyof Routes & string> {
  route: K;
  routeParams?: Routes[K] | undefined;
  query?: Record<string, unknown> | undefined;
  /** Query options to prefetch on hover. Pass the result of `api.*.queryOptions()`. */
  prefetch?: PrefetchOptions | undefined;
  /** QueryClient instance required when `prefetch` is provided. */
  queryClient?: QueryClient | undefined;
  [key: string]: unknown;
}

export default class Link<
  K extends keyof Routes & string = keyof Routes & string,
> extends SvelteComponent<LinkProps<K>> {}
