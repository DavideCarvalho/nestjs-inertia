// Client-side entry point: boot Inertia.js with Svelte 5
import 'reflect-metadata';
import { createInertiaApp } from '@inertiajs/svelte';
import { mount } from 'svelte';
import { route } from '../.nestjs-inertia/routes.js';

// Pass the route resolver as Svelte context so all descendants (including <Link>) can inject it
const appContext = new Map([['inertia-routes', route]]);

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob('./pages/*.svelte', { eager: true });
    return (pages as Record<string, unknown>)[`./pages/${name}.svelte`];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup({ el, App, props }: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    mount(App, { target: el, props, context: appContext });
  },
});
