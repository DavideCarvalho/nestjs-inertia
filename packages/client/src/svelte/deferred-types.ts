import type { InertiaPages } from '@dudousxd/nestjs-inertia';
import type { Snippet } from 'svelte';
import type { DeferredPropKey } from '../shared/deferred-types.js';

export type { DeferredPropKey } from '../shared/deferred-types.js';

/**
 * Props of the typed {@link import('./Deferred.svelte').default} component, with
 * `data` keyed by the page's prop names when codegen has augmented
 * `InertiaPages`.
 */
export interface DeferredProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Deferred prop name(s) to wait on — keyed by the page's prop names when codegen is set up. */
  data: DeferredPropKey<K> | DeferredPropKey<K>[];
  rescue?: Snippet<[{ reloading: boolean }]>;
  fallback?: Snippet;
  children?: Snippet<[{ reloading: boolean }]>;
}

/**
 * Props of the typed {@link import('./WhenVisible.svelte').default} component.
 */
export interface WhenVisibleProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Prop name(s) to load when the element scrolls into view — keyed by the page's prop names. */
  data?: DeferredPropKey<K> | DeferredPropKey<K>[];
  /** Reload options forwarded to the underlying request. */
  params?: Record<string, unknown>;
  buffer?: number;
  as?: keyof HTMLElementTagNameMap;
  always?: boolean;
  children?: Snippet<[{ fetching: boolean }]>;
  fallback?: Snippet;
}
