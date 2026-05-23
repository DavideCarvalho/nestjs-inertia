import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
import type { SvelteComponent } from 'svelte';

type Routes = RegistryRoutes;

export interface LinkProps<K extends keyof Routes & string> {
  route: K;
  routeParams?: Routes[K] | undefined;
  query?: Record<string, unknown> | undefined;
  [key: string]: unknown;
}

export default class Link<
  K extends keyof Routes & string = keyof Routes & string,
> extends SvelteComponent<LinkProps<K>> {}
