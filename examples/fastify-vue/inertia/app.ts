// Client-side entry point: boot Inertia.js with Vue 3
import 'reflect-metadata';
import { INERTIA_ROUTES_KEY } from '@dudousxd/nestjs-inertia-client/vue';
import { createInertiaApp } from '@inertiajs/vue3';
import { createApp } from 'vue';
import { route } from '../.nestjs-inertia/routes.js';

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob('./pages/*.vue', { eager: true });
    return (pages as Record<string, unknown>)[`./pages/${name}.vue`];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup({ el, App, props }: any) {
    const app = createApp(App, props);
    // Provide the route resolver at the app level so all components can inject it
    app.provide(INERTIA_ROUTES_KEY, route);
    app.mount(el);
  },
});
