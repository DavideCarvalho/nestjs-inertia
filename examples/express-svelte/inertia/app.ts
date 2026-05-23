// Client-side entry point: boot Inertia.js with Svelte 5
import 'reflect-metadata';
import { setRouteResolver } from '@dudousxd/nestjs-inertia-client/svelte';
import { createInertiaApp } from '@inertiajs/svelte';
import { mount } from 'svelte';
import { route } from '../.nestjs-inertia/routes.js';

// Wire the typed route helper so <Link href={route(...)} /> works
setRouteResolver(route);

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob('./pages/*.svelte', { eager: true });
    return (pages as Record<string, unknown>)[`./pages/${name}.svelte`];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup({ el, App, props }: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    mount(App, { target: el, props });
  },
});
