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

export const Inertia = {
  always<T>(fn: () => T | Promise<T>): Marker<T> {
    return make('always', fn);
  },
  optional<T>(fn: () => T | Promise<T>): Marker<T> {
    return make('optional', fn);
  },
  lazy<T>(fn: () => T | Promise<T>): Marker<T> {
    return make('optional', fn);
  },
  once<T>(fn: () => T | Promise<T>): Marker<T> {
    return make('once', fn);
  },
  defer<T>(fn: () => T | Promise<T>, group: string = 'default'): Marker<T> {
    return make('defer', fn, { group });
  },
  merge<T>(
    fn: () => T | Promise<T>,
    opts?: { matchOn?: string; deep?: boolean },
  ): Marker<T> {
    const meta: Record<string, unknown> = { deep: opts?.deep ?? false };
    if (opts?.matchOn !== undefined) meta.matchOn = opts.matchOn;
    return make('merge', fn, meta);
  },
};

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
