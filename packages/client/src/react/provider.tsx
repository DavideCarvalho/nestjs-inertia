import { type ReactNode, createContext, useContext } from 'react';

type RouteResolver = (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => string;

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
  return <InertiaRoutesContext value={routes}>{children}</InertiaRoutesContext>;
}
