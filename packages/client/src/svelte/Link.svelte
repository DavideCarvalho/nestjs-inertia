<script lang="ts" generics="K extends keyof import('@dudousxd/nestjs-inertia').InertiaRegistry['routes'] & string">
  import { Link as InertiaLink } from '@inertiajs/svelte';
  import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
  import { route as buildRoute } from '../routes-stub.js';

  type Routes = RegistryRoutes;

  export let route: K;
  // routeParams is optional at the .svelte boundary; compile-time enforcement
  // comes from d.ts augmentation of InertiaRegistry in the consuming app.
  export let routeParams: Routes[K] | undefined = undefined;
  export let query: Record<string, unknown> | undefined = undefined;

  $: href = buildRoute(route, routeParams as never, query);
</script>

<InertiaLink {href} {...$$restProps}>
  <slot />
</InertiaLink>
