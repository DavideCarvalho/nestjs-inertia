/* v8 ignore next 2 -- import resolution is not a branch */
import { type ReactNode, createContext, createElement, useContext, useEffect } from 'react';
import { setGlobalHeaders } from '../fetcher/global-headers.js';

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
  /** Called before every fetcher request. Return headers to inject (e.g. Authorization). */
  headers?: () => Record<string, string>;
  children: ReactNode;
}

export function InertiaRouteProvider({ routes, headers, children }: InertiaRouteProviderProps) {
  useEffect(() => {
    if (!headers) return;
    setGlobalHeaders(headers);
    return () => setGlobalHeaders(() => ({}));
  }, [headers]);

  return createElement(InertiaRoutesContext, { value: routes }, children);
}
