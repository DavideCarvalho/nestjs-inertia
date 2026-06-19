import { Logger } from '@nestjs/common';
import { createInertiaDecorator } from './decorator/inertia.decorator.js';
import type { InertiaPages } from './types/registry.js';

const markerLogger = new Logger('Inertia');

const MARKER = Symbol('inertia.marker');

/**
 * Resolves to valid page names when codegen has augmented `InertiaPages`,
 * otherwise falls back to `string` for backwards compatibility.
 */
type PageName = keyof InertiaPages extends never ? string : keyof InertiaPages & string;

export type MarkerKind = 'always' | 'optional' | 'defer' | 'merge' | 'once' | 'scroll';

export interface Marker<T = unknown> {
  [MARKER]: true;
  kind: MarkerKind;
  value: () => T | Promise<T>;
  meta: Record<string, unknown>;
}

function make<T>(
  kind: MarkerKind,
  value: () => T | Promise<T>,
  meta: Record<string, unknown> = {},
): Marker<T> {
  return { [MARKER]: true, kind, value, meta };
}

// Inertia(component) acts as a decorator AND retains namespace methods.
function inertiaDecorator(component: PageName): MethodDecorator {
  return createInertiaDecorator(component);
}

// Marker helpers (preserved from before)
function always<T>(fn: () => T | Promise<T>): Marker<T> {
  return make('always', fn);
}
function optional<T>(fn: () => T | Promise<T>): Marker<T> {
  return make('optional', fn);
}

let _lazyWarned = false;
/**
 * @deprecated Use `Inertia.optional()` instead. `Inertia.lazy()` is a deprecated alias
 * kept for v1/v2 backward compatibility and will be removed in a future major version.
 */
function lazy<T>(fn: () => T | Promise<T>): Marker<T> {
  if (!_lazyWarned) {
    _lazyWarned = true;
    markerLogger.warn(
      'Inertia.lazy() is deprecated and will be removed in a future version. ' +
        'Use Inertia.optional() instead (Inertia v3).',
    );
  }
  return optional(fn);
}
/**
 * Deferred props: omitted from the first visit, announced under `deferredProps`,
 * then fetched by the client via an automatic partial reload.
 *
 * @param groupOrOpts A group name (string) or an options object. When
 *   `{ rescue: true }`, a failure while resolving the deferred prop on the
 *   follow-up partial reload is caught: the prop is omitted and its path is
 *   reported under `rescuedProps` instead of failing the whole request.
 */
function defer<T>(
  fn: () => T | Promise<T>,
  groupOrOpts?: string | { group?: string; rescue?: boolean },
): Marker<T> {
  const group = typeof groupOrOpts === 'string' ? groupOrOpts : (groupOrOpts?.group ?? 'default');
  const rescue = typeof groupOrOpts === 'object' ? (groupOrOpts.rescue ?? false) : false;
  return make('defer', fn, { group, rescue });
}
/**
 * Once props: resolved on the first visit, then cached client-side and reused on
 * subsequent visits. The client reports the cache keys it already holds fresh via
 * the `X-Inertia-Except-Once-Props` header; the server then skips resolving those.
 *
 * @param opts.key       Stable cache key the client uses across pages. Defaults
 *                       to the prop name (or its full dot-path when nested).
 * @param opts.expiresAt Absolute expiry as epoch milliseconds, surfaced in the
 *                       `onceProps` metadata. `null` (default) means no expiry.
 */
function once<T>(
  fn: () => T | Promise<T>,
  opts?: { key?: string; expiresAt?: number | null },
): Marker<T> {
  const meta: Record<string, unknown> = { expiresAt: opts?.expiresAt ?? null };
  if (opts?.key !== undefined) meta.key = opts.key;
  return make('once', fn, meta);
}
function merge<T>(
  fn: () => T | Promise<T>,
  opts?: { matchOn?: string | string[]; deep?: boolean; prepend?: boolean },
): Marker<T> {
  const meta: Record<string, unknown> = {
    deep: opts?.deep ?? false,
    prepend: opts?.prepend ?? false,
  };
  if (opts?.matchOn !== undefined) meta.matchOn = opts.matchOn;
  return make('merge', fn, meta);
}

/**
 * Infinite-scroll props: a paginated value (`{ data: [...], ...cursor }`) whose
 * inner `data` array is merged (appended, or prepended per the
 * `X-Inertia-Infinite-Scroll-Merge-Intent` header) across visits, while a
 * pagination cursor is announced under `scrollProps`.
 *
 * @param opts.pageName The pagination query-param name. Defaults to the resolved
 *                      value's `pageName`, then `'page'`.
 * @param opts.matchOn  Key(s) for de-duplicating merged rows by identity.
 * @param opts.defer    Defer the scroll prop: the first visit announces it under
 *                      `deferredProps` and emits the merge label, but ships no
 *                      value or cursor until the follow-up partial reload.
 * @param opts.group    Deferred group name (only meaningful with `defer`).
 */
function scroll<T>(
  fn: () => T | Promise<T>,
  opts?: { pageName?: string; matchOn?: string | string[]; defer?: boolean; group?: string },
): Marker<T> {
  const meta: Record<string, unknown> = {};
  if (opts?.pageName !== undefined) meta.pageName = opts.pageName;
  if (opts?.matchOn !== undefined) meta.matchOn = opts.matchOn;
  if (opts?.defer) {
    meta.defer = true;
    meta.group = opts.group ?? 'default';
  }
  return make('scroll', fn, meta);
}

// Attach namespace methods to the function via Object.assign
type InertiaFn = ((component: PageName) => MethodDecorator) & {
  always: typeof always;
  optional: typeof optional;
  lazy: typeof lazy;
  defer: typeof defer;
  once: typeof once;
  merge: typeof merge;
  scroll: typeof scroll;
};
const Inertia = Object.assign(inertiaDecorator, {
  always,
  optional,
  lazy,
  defer,
  once,
  merge,
  scroll,
}) as InertiaFn;

export { Inertia };

export function isMarker(value: unknown): value is Marker {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[MARKER] === true
  );
}

export function getMarkerKind(marker: Marker): MarkerKind {
  return marker.kind;
}

export function getMarkerValue<T>(marker: Marker<T>): () => T | Promise<T> {
  return marker.value;
}

export function getMarkerMeta(marker: Marker): Record<string, unknown> {
  return marker.meta;
}

/** @internal — resets the once-per-process lazy deprecation flag (for tests only) */
export function _resetLazyDeprecationWarning(): void {
  _lazyWarned = false;
}
