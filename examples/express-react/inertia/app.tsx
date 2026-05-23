import 'reflect-metadata';
import { setRouteResolver } from '@dudousxd/nestjs-inertia-client/react';
import { hydrateClientFromInertia } from '@dudousxd/nestjs-inertia-client/ssr';
import { createInertiaApp } from '@inertiajs/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { route } from '../.nestjs-inertia/routes.js';

setRouteResolver(route);

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob('./pages/*.tsx', { eager: true });
    return (pages as Record<string, unknown>)[`./pages/${name}.tsx`];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup({ el, App, props }: any) {
    const qc = hydrateClientFromInertia(
      props.initialPage as Parameters<typeof hydrateClientFromInertia>[0],
    );
    createRoot(el).render(
      <QueryClientProvider client={qc}>
        <App {...props} />
      </QueryClientProvider>,
    );
  },
});
