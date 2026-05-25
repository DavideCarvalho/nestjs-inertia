<script lang="ts" generics="K extends keyof import('@dudousxd/nestjs-inertia').InertiaRegistry['routes'] & string">
  import { Link as InertiaLink } from '@inertiajs/svelte';
  import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
  import type { QueryClient } from '@tanstack/query-core';
  import { useInertiaRoutes } from './provider.js';
  import type { Snippet } from 'svelte';

  type Routes = RegistryRoutes;

  export interface PrefetchOptions {
    queryKey: readonly unknown[];
    queryFn: () => Promise<unknown>;
  }

  interface Props {
    route: K;
    routeParams?: Routes[K];
    query?: Record<string, unknown>;
    /** Query options to prefetch on hover. Pass the result of `api.*.queryOptions()`. */
    prefetch?: PrefetchOptions;
    /** QueryClient instance required when `prefetch` is provided. */
    queryClient?: QueryClient;
    children?: Snippet;
    [key: string]: unknown;
  }

  const { route, routeParams = undefined, query = undefined, prefetch = undefined, queryClient = undefined, children, ...rest }: Props = $props();

  const resolveRoute = useInertiaRoutes();
  const href = $derived(resolveRoute(route, routeParams as never, query));

  let prefetched = false;

  function handleMouseEnter() {
    if (prefetch && queryClient && !prefetched) {
      prefetched = true;
      queryClient.prefetchQuery(prefetch);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span onmouseenter={handleMouseEnter} style="display:contents">
  <InertiaLink {href} {...rest}>
    {@render children?.()}
  </InertiaLink>
</span>
