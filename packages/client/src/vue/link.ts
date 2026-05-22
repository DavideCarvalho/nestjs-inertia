import { Link as InertiaLink } from '@inertiajs/vue3';
import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import { route as buildRoute } from '../routes-stub.js';
import type { RegistryRoutes } from '@dudousxd/nestjs-inertia';

type AnyRoutes = RegistryRoutes;

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
  },
  setup(props, { slots, attrs }) {
    return () => {
      const href = buildRoute(
        props.route,
        props.routeParams as Record<string, unknown> | undefined,
        props.query,
      );

      const linkProps: Record<string, unknown> = {
        href,
        ...attrs,
      };

      if (props.class) {
        linkProps['class'] = props.class;
      }

      if (props.method) {
        linkProps['method'] = props.method;
      }

      return h(InertiaLink, linkProps, slots);
    };
  },
});
