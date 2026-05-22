import { describe, it, expect } from 'vitest';
import { Inertia, isMarker, getMarkerKind, getMarkerValue, getMarkerMeta } from '../src/markers.js';

describe('Inertia markers', () => {
  it('always() wraps a value (function or literal)', () => {
    const m = Inertia.always(() => 42);
    expect(isMarker(m)).toBe(true);
    expect(getMarkerKind(m)).toBe('always');
  });

  it('optional() marker', () => {
    const m = Inertia.optional(async () => 'x');
    expect(getMarkerKind(m)).toBe('optional');
  });

  it('defer() marker with group default "default"', () => {
    const m = Inertia.defer(() => 'x');
    expect(getMarkerKind(m)).toBe('defer');
    expect(getMarkerMeta(m)).toEqual({ group: 'default' });
  });

  it('defer() marker with custom group', () => {
    const m = Inertia.defer(() => 'x', 'secondary');
    expect(getMarkerMeta(m)).toEqual({ group: 'secondary' });
  });

  it('merge() marker, default opts', () => {
    const m = Inertia.merge(() => [1, 2]);
    expect(getMarkerKind(m)).toBe('merge');
    expect(getMarkerMeta(m)).toEqual({ deep: false });
  });

  it('merge() marker, with matchOn + deep', () => {
    const m = Inertia.merge(() => [1], { matchOn: 'id', deep: true });
    expect(getMarkerMeta(m)).toEqual({ matchOn: 'id', deep: true });
  });

  it('getMarkerValue extracts the inner function', async () => {
    const m = Inertia.always(() => 42);
    const fn = getMarkerValue(m);
    expect(await fn()).toBe(42);
  });

  it('isMarker returns false for plain values', () => {
    expect(isMarker({})).toBe(false);
    expect(isMarker(null)).toBe(false);
    expect(isMarker(undefined)).toBe(false);
    expect(isMarker(42)).toBe(false);
    expect(isMarker('x')).toBe(false);
  });

  it('Inertia.lazy is an alias for optional (v1 compat)', () => {
    const m = Inertia.lazy(() => 'x');
    expect(getMarkerKind(m)).toBe('optional');
  });
});
