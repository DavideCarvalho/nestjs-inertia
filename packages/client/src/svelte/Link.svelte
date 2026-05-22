<script lang="ts" generics="K extends keyof import('@dudousxd/nestjs-inertia').InertiaRegistry['routes'] & string">
  import { Link as InertiaLink } from '@inertiajs/svelte';
  import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
  import { route as buildRoute } from '../routes-stub.js';
  import type { Snippet } from 'svelte';

  type Routes = RegistryRoutes;

  interface Props {
    route: K;
    routeParams?: Routes[K];
    query?: Record<string, unknown>;
    children?: Snippet;
    [key: string]: unknown;
  }

  const { route, routeParams = undefined, query = undefined, children, ...rest }: Props = $props();

  const href = $derived(buildRoute(route, routeParams as never, query));
</script>

<InertiaLink {href} {...rest}>
  {@render children?.()}
</InertiaLink>
