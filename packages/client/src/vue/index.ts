/* v8 ignore next 5 -- re-exports are not branches */
export { Link } from './link.js';
export type { LinkProps } from './link.js';
export type { PrefetchOptions } from '../shared/prefetch-types.js';
export { provideInertiaRoutes, useInertiaRoutes, INERTIA_ROUTES_KEY } from './provider.js';
export { useTypedReload } from './use-typed-reload.js';
export { useForm } from './use-typed-form.js';
export type { InertiaPageProps } from './use-typed-form.js';
export { Deferred, WhenVisible } from './deferred.js';
export type {
  DeferredProps,
  DeferredPropKey,
  WhenVisibleProps,
} from './deferred.js';
export { useTypedPoll, prefetchRoute } from './use-typed-poll.js';
export type {
  CacheFor,
  TypedPollOptions,
  PollControlOptions,
  PrefetchRouteOptions,
} from './use-typed-poll.js';
