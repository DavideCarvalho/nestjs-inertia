import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';
/* v8 ignore next -- import resolution is not a branch */
import { Link as InertiaLink } from '@inertiajs/vue3';
import type { QueryClient } from '@tanstack/query-core';
import { defineComponent, h, ref } from 'vue';
import type { PropType } from 'vue';
import { useInertiaRoutes } from './provider.js';

type AnyRoutes = RegistryRoutes;

export interface PrefetchOptions {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}

// Conditional type helpers mirroring the React Link:
// routeParams is required when the route has path params, optional otherwise.
type RoutePropsFor<K extends keyof AnyRoutes> = AnyRoutes[K] extends
  | Record<string, never>
  | undefined
  ? { routeParams?: never }
  : { routeParams: AnyRoutes[K] };

export type LinkProps<K extends keyof AnyRoutes> = {
  route: K;
  query?: Record<string, unknown>;
  class?: string;
  method?: string;
  /** Query options to prefetch on hover. Pass the result of `api.*.queryOptions()`. */
  prefetch?: PrefetchOptions;
  /** QueryClient instance required when `prefetch` is provided. */
  queryClient?: QueryClient;
} & RoutePropsFor<K>;

export const Link = defineComponent({
  name: 'InertiaTypedLink',
  props: {
    route: {
      type: String as PropType<keyof AnyRoutes & string>,
      required: true,
    },
    routeParams: {
      type: Object as PropType<Record<string, unknown>>,
      default: undefined,
    },
    query: {
      type: Object as PropType<Record<string, unknown>>,
      default: undefined,
    },
    class: {
      type: String,
      default: undefined,
    },
    method: {
      type: String,
      default: undefined,
    },
    prefetch: {
      type: Object as PropType<PrefetchOptions>,
      default: undefined,
    },
    queryClient: {
      type: Object as PropType<QueryClient>,
      default: undefined,
    },
  },
  setup(props, { slots, attrs }) {
    const resolveRoute = useInertiaRoutes();
    const prefetched = ref(false);

    function onMouseEnter() {
      if (props.prefetch && props.queryClient && !prefetched.value) {
        prefetched.value = true;
        props.queryClient.prefetchQuery(props.prefetch);
      }
    }

    return () => {
      const href = resolveRoute(
        props.route,
        props.routeParams as Record<string, unknown> | undefined,
        props.query,
      );

      const linkProps: Record<string, unknown> = {
        href,
        onMouseenter: onMouseEnter,
        ...attrs,
      };

      if (props.class) {
        linkProps.class = props.class;
      }

      if (props.method) {
        linkProps.method = props.method;
      }

      return h(InertiaLink, linkProps, slots);
    };
  },
});
