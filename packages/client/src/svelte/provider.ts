/* v8 ignore next -- import resolution is not a branch */
import { getContext, setContext } from 'svelte';

// biome-ignore lint/suspicious/noExplicitAny: must accept the codegen's generic route() signature
type RouteResolver = (...args: any[]) => string;

const KEY = 'inertia-routes';

export function provideInertiaRoutes(resolver: RouteResolver): void {
  setContext(KEY, resolver);
}

export function useInertiaRoutes(): RouteResolver {
  const resolver = getContext<RouteResolver | undefined>(KEY);
  if (!resolver) {
    throw new Error(
      '@dudousxd/nestjs-inertia-client: provideInertiaRoutes() not called.\n\n' +
        'Call provideInertiaRoutes(route) in your root layout or app setup:\n\n' +
        "  import { provideInertiaRoutes } from '@dudousxd/nestjs-inertia-client/svelte';\n" +
        "  import { route } from './.nestjs-inertia/routes.js';\n\n" +
        '  provideInertiaRoutes(route);',
    );
  }
  return resolver;
}
