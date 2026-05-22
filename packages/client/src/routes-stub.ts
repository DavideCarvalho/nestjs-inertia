// Runtime stub for the generated route() helper. Consumers shadow this via module
// augmentation OR by relying on the generated routes.ts in their own .nestjs-inertia/.
// The stub builds the href the same way the generated runtime would, but uses string keys
// because at runtime the route name -> path mapping must come from the generated module.
//
// At runtime, the typed Link defers to whatever `route()` the user has imported into their
// app — we DON'T re-import from the codegen output here (would create a cyclic dep).
// Instead, the user must call setRouteResolver() once at app boot:

type ResolverFn = (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => string;

// Public input type is intentionally permissive so the codegen-emitted `route()` —
// which has a narrow generic signature `<K extends RouteName>(name: K, ...)` — assigns
// without a cast at the call site. Internally we treat the resolver as ResolverFn.
// biome-ignore lint/suspicious/noExplicitAny: variance shim for narrow generic callers
type ResolverInput = (name: any, params?: any, query?: any) => string;

let resolver: ResolverFn | null = null;

export function setRouteResolver(fn: ResolverInput | null): void {
  resolver = fn as ResolverFn | null;
}

export function route(
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
): string {
  if (!resolver) {
    throw new Error(
      '@dudousxd/nestjs-inertia-client: setRouteResolver() not called. ' +
        'Call setRouteResolver(route) at app boot, where `route` comes from your generated `.nestjs-inertia/routes.ts`.',
    );
  }
  return resolver(name, params, query);
}
