import type { InertiaPages } from '@dudousxd/nestjs-inertia';
/* v8 ignore next 2 -- import resolution is not a branch */
import { Deferred as InertiaDeferred, WhenVisible as InertiaWhenVisible } from '@inertiajs/vue3';
import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import type { DeferredPropKey } from '../shared/deferred-types.js';

export type { DeferredPropKey } from '../shared/deferred-types.js';

/**
 * Props of the typed {@link Deferred} component, with `data` keyed by the page's
 * prop names when codegen has augmented `InertiaPages`.
 */
export interface DeferredProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Deferred prop name(s) to wait on — keyed by the page's prop names when codegen is set up. */
  data: DeferredPropKey<K> | DeferredPropKey<K>[];
}

/**
 * Typed wrapper over `@inertiajs/vue3`'s `<Deferred>`.
 *
 * Mirrors the official component verbatim at runtime (props and the
 * `default` / `fallback` / `rescue` slots are forwarded through); the only
 * addition is that `data` is keyed by the page's prop names. Bind the page key
 * via the generic in `<script setup lang="ts">`:
 *
 * ```vue
 * <Deferred data="stats">
 *   <template #fallback>Loading…</template>
 *   <Stats :data="stats" />
 * </Deferred>
 * ```
 */
export const Deferred = defineComponent({
  name: 'InertiaTypedDeferred',
  props: {
    data: {
      type: [String, Array] as PropType<string | string[]>,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () => h(InertiaDeferred, { data: props.data }, slots);
  },
});

/**
 * Props of the typed {@link WhenVisible} component.
 */
export interface WhenVisibleProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Prop name(s) to load when the element scrolls into view — keyed by the page's prop names. */
  data?: DeferredPropKey<K> | DeferredPropKey<K>[];
  /** Reload options forwarded to the underlying request. */
  params?: Record<string, unknown>;
  buffer?: number;
  as?: string;
  always?: boolean;
}

/**
 * Typed wrapper over `@inertiajs/vue3`'s `<WhenVisible>`.
 *
 * Mirrors the official component verbatim at runtime; `data` is keyed by the
 * page's prop names when the page key is supplied as the generic.
 */
export const WhenVisible = defineComponent({
  name: 'InertiaTypedWhenVisible',
  props: {
    data: {
      type: [String, Array] as PropType<string | string[]>,
      default: undefined,
    },
    params: {
      type: Object as PropType<Record<string, unknown>>,
      default: undefined,
    },
    buffer: {
      type: Number,
      default: undefined,
    },
    as: {
      type: String,
      default: undefined,
    },
    always: {
      type: Boolean,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    return () => {
      const forwarded: Record<string, unknown> = {};
      if (props.data !== undefined) forwarded.data = props.data;
      if (props.params !== undefined) forwarded.params = props.params;
      if (props.buffer !== undefined) forwarded.buffer = props.buffer;
      if (props.as !== undefined) forwarded.as = props.as;
      if (props.always !== undefined) forwarded.always = props.always;
      return h(InertiaWhenVisible, forwarded, slots);
    };
  },
});
