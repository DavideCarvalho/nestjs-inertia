/* v8 ignore next -- import resolution is not a branch */
import { type ReactNode, createContext, createElement, useContext } from 'react';

// biome-ignore lint/suspicious/noExplicitAny: must accept the codegen's generic route() signature
export type RouteResolver = (...args: any[]) => string;

const InertiaRoutesContext = createContext<RouteResolver | null>(null);

export function useInertiaRoutes(): RouteResolver {
  const resolver = useContext(InertiaRoutesContext);
  if (!resolver) {
    throw new Error(
      '@dudousxd/nestjs-inertia-client: <InertiaRouteProvider> not found in the component tree.\n\n' +
        'Wrap your app with <InertiaRouteProvider routes={route}> in your entry file:\n\n' +
        "  import { InertiaRouteProvider } from '@dudousxd/nestjs-inertia-client/react';\n" +
        "  import { route } from './.nestjs-inertia/routes.js';\n\n" +
        '  <InertiaRouteProvider routes={route}>\n' +
        '    <App {...props} />\n' +
        '  </InertiaRouteProvider>',
    );
  }
  return resolver;
}

export interface InertiaRouteProviderProps {
  routes: RouteResolver;
  children: ReactNode;
}

export function InertiaRouteProvider({ routes, children }: InertiaRouteProviderProps) {
  return createElement(InertiaRoutesContext, { value: routes }, children);
}
