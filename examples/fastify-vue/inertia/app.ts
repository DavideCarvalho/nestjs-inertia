import 'reflect-metadata';
import { setRouteResolver } from '@dudousxd/nestjs-inertia-client/vue';
import { createInertiaApp } from '@inertiajs/vue3';
import { createApp } from 'vue';
import { route } from '../.nestjs-inertia/routes.js';

// Cast: ResolverFn accepts `string` but the generated route() only accepts
// the narrow RouteName union — safe at runtime because Link always passes a valid name.
setRouteResolver(route as Parameters<typeof setRouteResolver>[0]);

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob('./pages/*.vue', { eager: true });
    return (pages as Record<string, unknown>)[`./pages/${name}.vue`];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup({ el, App, props }: any) {
    createApp(App, props).mount(el);
  },
});
