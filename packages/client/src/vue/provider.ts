import { type InjectionKey, inject, provide } from 'vue';

type RouteResolver = (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => string;

export const INERTIA_ROUTES_KEY: InjectionKey<RouteResolver> = Symbol('inertia-routes');

export function provideInertiaRoutes(resolver: RouteResolver): void {
  provide(INERTIA_ROUTES_KEY, resolver);
}

export function useInertiaRoutes(): RouteResolver {
  const resolver = inject(INERTIA_ROUTES_KEY);
  if (!resolver) {
    throw new Error(
      '@dudousxd/nestjs-inertia-client: provideInertiaRoutes() not called.\n\n' +
        'Call provideInertiaRoutes(route) in your app setup:\n\n' +
        "  import { provideInertiaRoutes } from '@dudousxd/nestjs-inertia-client/vue';\n" +
        "  import { route } from './.nestjs-inertia/routes.js';\n\n" +
        '  setup({ el, App, props, plugin }) {\n' +
        '    const app = createApp(...);\n' +
        '    provideInertiaRoutes(route); // before mount\n' +
        '    app.mount(el);\n' +
        '  }',
    );
  }
  return resolver;
}
