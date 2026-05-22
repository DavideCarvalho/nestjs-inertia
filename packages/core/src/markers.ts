import { createInertiaDecorator } from './decorator/inertia.decorator.js';

const MARKER = Symbol('inertia.marker');

export type MarkerKind = 'always' | 'optional' | 'defer' | 'merge' | 'once';

export interface Marker<T = unknown> {
  [MARKER]: true;
  kind: MarkerKind;
  value: () => T | Promise<T>;
  meta: Record<string, unknown>;
}

function make<T>(kind: MarkerKind, value: () => T | Promise<T>, meta: Record<string, unknown> = {}): Marker<T> {
  return { [MARKER]: true, kind, value, meta };
}

// Inertia(component) acts as a decorator AND retains namespace methods.
function inertiaDecorator(component: string): MethodDecorator {
  return createInertiaDecorator(component);
}

// Marker helpers (preserved from before)
function always<T>(fn: () => T | Promise<T>): Marker<T> {
  return make('always', fn);
}
function optional<T>(fn: () => T | Promise<T>): Marker<T> {
  return make('optional', fn);
}
function lazy<T>(fn: () => T | Promise<T>): Marker<T> {
  // v1 compatibility alias
  return make('optional', fn);
}
function defer<T>(fn: () => T | Promise<T>, group: string = 'default'): Marker<T> {
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
type InertiaFn = typeof inertiaDecorator & {
  always: typeof always;
  optional: typeof optional;
  lazy: typeof lazy;
  defer: typeof defer;
  once: typeof once;
  merge: typeof merge;
};
const Inertia = Object.assign(inertiaDecorator, { always, optional, lazy, defer, once, merge }) as InertiaFn;

export { Inertia };

export function isMarker(value: unknown): value is Marker {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[MARKER] === true;
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
