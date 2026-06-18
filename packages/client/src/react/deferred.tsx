import type { InertiaPages } from '@dudousxd/nestjs-inertia';
/* v8 ignore next 2 -- import resolution is not a branch */
import { Deferred as InertiaDeferred, WhenVisible as InertiaWhenVisible } from '@inertiajs/react';
import { type ComponentProps, type ReactNode, createElement } from 'react';
import type { DeferredPropKey } from '../shared/deferred-types.js';

export type { DeferredPropKey } from '../shared/deferred-types.js';

type SlotChildren<TSlot> = ReactNode | ((props: TSlot) => ReactNode);

interface DeferredSlotProps {
  reloading: boolean;
}

export interface DeferredProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Deferred prop name(s) to wait on — keyed by the page's prop names when codegen is set up. */
  data: DeferredPropKey<K> | DeferredPropKey<K>[];
  fallback: ReactNode | (() => ReactNode);
  rescue?: SlotChildren<DeferredSlotProps>;
  children: SlotChildren<DeferredSlotProps>;
}

/**
 * Typed wrapper over `@inertiajs/react`'s `<Deferred>`.
 *
 * Mirrors the official component verbatim at runtime; the only addition is that
 * `data` is keyed by the page's prop names. Pass the page key as the generic
 * to bind it: `<Deferred<'dashboard'> data="stats" .../>`.
 */
export function Deferred<K extends keyof InertiaPages | unknown = unknown>(
  props: DeferredProps<K>,
): ReactNode {
  return createElement(
    InertiaDeferred as (p: ComponentProps<typeof InertiaDeferred>) => ReactNode,
    props as unknown as ComponentProps<typeof InertiaDeferred>,
  );
}

interface WhenVisibleSlotProps {
  fetching: boolean;
}

export interface WhenVisibleProps<K extends keyof InertiaPages | unknown = unknown> {
  /** Prop name(s) to load when the element scrolls into view — keyed by the page's prop names. */
  data?: DeferredPropKey<K> | DeferredPropKey<K>[];
  fallback: ReactNode | (() => ReactNode);
  /** Reload options forwarded to the underlying request. */
  params?: ComponentProps<typeof InertiaWhenVisible>['params'];
  buffer?: number;
  as?: string;
  always?: boolean;
  children: SlotChildren<WhenVisibleSlotProps>;
}

/**
 * Typed wrapper over `@inertiajs/react`'s `<WhenVisible>`.
 *
 * Mirrors the official component verbatim at runtime; `data` is keyed by the
 * page's prop names when the page key is supplied as the generic.
 */
export function WhenVisible<K extends keyof InertiaPages | unknown = unknown>(
  props: WhenVisibleProps<K>,
): ReactNode {
  return createElement(
    InertiaWhenVisible as (p: ComponentProps<typeof InertiaWhenVisible>) => ReactNode,
    props as unknown as ComponentProps<typeof InertiaWhenVisible>,
  );
}
