import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
import type { CacheFor, PrefetchRouteOptions } from './typed-poll-types.js';

type AnyRoutes = RegistryRoutes;

// biome-ignore lint/suspicious/noExplicitAny: matches the codegen's generic route() signature
export type RouteResolver = (...args: any[]) => string;

/** The slice of Inertia's `router` that {@link runPrefetchRoute} depends on. */
export interface PrefetchRouter {
  prefetch: (
    href: string,
    visitOptions: { method: 'get' },
    // biome-ignore lint/suspicious/noExplicitAny: forwards the adapter's native prefetch options verbatim
    prefetchOptions: any,
  ) => void;
}

/**
 * Framework-agnostic core of the typed `prefetchRoute` helper.
 *
 * Resolves a typed route to an href via the codegen `route` resolver, then
 * delegates to Inertia v2's native `router.prefetch` (so the response is cached
 * by Inertia's own prefetch cache, not TanStack Query). The adapter-specific
 * `router` is injected, keeping this identical across React, Vue, and Svelte.
 */
export function runPrefetchRoute<K extends keyof AnyRoutes & string>(
  router: PrefetchRouter,
  resolve: RouteResolver,
  route: K,
  options?: PrefetchRouteOptions<K>,
): void {
  const href = resolve(
    route,
    (options as { routeParams?: Record<string, unknown> } | undefined)?.routeParams,
    options?.query,
  );
  const prefetchOptions: { cacheFor?: CacheFor } = {};
  if (options?.cacheFor !== undefined) prefetchOptions.cacheFor = options.cacheFor;
  router.prefetch(href, { method: 'get' }, prefetchOptions);
}
