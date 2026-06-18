import type { InertiaPages, RegistryRoutes } from '@dudousxd/nestjs-inertia';

type AnyRoutes = RegistryRoutes;

/**
 * `cacheFor` accepts a duration in milliseconds, a human string (`'30s'`,
 * `'1m'`), or a `[staleTime, cacheTime]` tuple — matching Inertia v2 native
 * prefetch semantics.
 *
 * Framework-agnostic: shared verbatim by the React, Vue, and Svelte adapters.
 */
export type CacheFor = number | string | Array<number | string>;

/**
 * Reload options for the typed poll helpers, keyed by the page's prop names.
 *
 * Framework-agnostic.
 */
export interface TypedPollOptions<K extends keyof InertiaPages> {
  only?: Array<keyof InertiaPages[K] & string>;
  except?: Array<keyof InertiaPages[K] & string>;
}

/**
 * Inertia native poll behaviour options.
 *
 * Framework-agnostic.
 */
export interface PollControlOptions {
  keepAlive?: boolean;
  autoStart?: boolean;
  mode?: 'overlap' | 'cancel' | 'rest';
}

/**
 * Options for the typed `prefetchRoute` helper.
 *
 * Framework-agnostic.
 */
export type PrefetchRouteOptions<K extends keyof AnyRoutes> = {
  query?: Record<string, unknown>;
  /** How long the prefetched response stays fresh / cached. */
  cacheFor?: CacheFor;
} & (AnyRoutes[K] extends Record<string, never> | undefined
  ? { routeParams?: never }
  : { routeParams: AnyRoutes[K] });
