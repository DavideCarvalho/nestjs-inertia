import { createInertiaDecorator } from './decorator/inertia.decorator.js';
import type { InertiaPages } from './types/registry.js';

const MARKER = Symbol('inertia.marker');

/**
 * Resolves to valid page names when codegen has augmented `InertiaPages`,
 * otherwise falls back to `string` for backwards compatibility.
 */
type PageName = keyof InertiaPages extends never ? string : keyof InertiaPages & string;

export type MarkerKind = 'always' | 'optional' | 'defer' | 'merge' | 'once';

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
    console.warn(
      '[nestjs-inertia] Inertia.lazy() is deprecated and will be removed in a future version. ' +
        'Use Inertia.optional() instead (Inertia v3).',
    );
  }
  return optional(fn);
}
function defer<T>(fn: () => T | Promise<T>, group = 'default'): Marker<T> {
  return make('defer', fn, { group });
}
function once<T>(fn: () => T | Promise<T>): Marker<T> {
  return make('once', fn);
}
function merge<T>(
  fn: () => T | Promise<T>,
  opts?: { matchOn?: string; deep?: boolean },
): Marker<T> {
  const meta: Record<string, unknown> = { deep: opts?.deep ?? false };
  if (opts?.matchOn !== undefined) meta.matchOn = opts.matchOn;
  return make('merge', fn, meta);
}

// Attach namespace methods to the function via Object.assign
type InertiaFn = ((component: PageName) => MethodDecorator) & {
  always: typeof always;
  optional: typeof optional;
  lazy: typeof lazy;
  defer: typeof defer;
  once: typeof once;
  merge: typeof merge;
};
const Inertia = Object.assign(inertiaDecorator, {
  always,
  optional,
  lazy,
  defer,
  once,
  merge,
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
