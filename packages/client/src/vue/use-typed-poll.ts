import type { InertiaPages, RegistryRoutes } from '@dudousxd/nestjs-inertia';
/* v8 ignore next 2 -- import resolution is not a branch */
import { router, usePoll } from '@inertiajs/vue3';
import { type RouteResolver, runPrefetchRoute } from '../shared/prefetch-route.js';
import type {
  PollControlOptions,
  PrefetchRouteOptions,
  TypedPollOptions,
} from '../shared/typed-poll-types.js';

export type {
  CacheFor,
  PollControlOptions,
  PrefetchRouteOptions,
  TypedPollOptions,
} from '../shared/typed-poll-types.js';

/**
 * Typed wrapper over Inertia v2's native `usePoll` (Vue composable).
 *
 * Unlike the TanStack-Query prefetch path used by `<Link prefetch>`, this routes
 * through Inertia's own polling engine (`router.poll`), so polled responses flow
 * back through the normal page-prop merge pipeline (including `merge`/`matchOn`).
 *
 * `only` / `except` are keyed by the page's prop names when codegen has set up
 * `InertiaPages`. Returns the native `{ start, stop }` controls.
 */
export function useTypedPoll<K extends keyof InertiaPages = never>(
  interval: number,
  options?: TypedPollOptions<K>,
  pollOptions?: PollControlOptions,
): ReturnType<typeof usePoll> {
  return usePoll(
    interval,
    {
      only: options?.only as string[] | undefined,
      except: options?.except as string[] | undefined,
    },
    pollOptions,
  );
}

/**
 * Imperatively prefetch a typed route using Inertia v2's native
 * `router.prefetch` (so the response is cached by Inertia's own prefetch cache,
 * not TanStack Query).
 *
 * Pass the codegen `route` resolver (the same one given to
 * `provideInertiaRoutes`) so the href is resolved type-safely:
 *
 * ```ts
 * import { route } from './.nestjs-inertia/routes.js';
 * prefetchRoute(route, 'users.show', { routeParams: { id }, cacheFor: '30s' });
 * ```
 */
export function prefetchRoute<K extends keyof RegistryRoutes & string>(
  resolve: RouteResolver,
  route: K,
  options?: PrefetchRouteOptions<K>,
): void {
  runPrefetchRoute(router, resolve, route, options);
}
