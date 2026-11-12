import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Inertia, getMarkerKind, getMarkerMeta, getMarkerValue, isMarker } from '../src/markers.js';

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
    expect(getMarkerMeta(m)).toEqual({ group: 'default', rescue: false });
  });

  it('defer() marker with custom group', () => {
    const m = Inertia.defer(() => 'x', 'secondary');
    expect(getMarkerMeta(m)).toEqual({ group: 'secondary', rescue: false });
  });

  it('defer() marker with options object (group + rescue)', () => {
    const m = Inertia.defer(() => 'x', { group: 'secondary', rescue: true });
    expect(getMarkerKind(m)).toBe('defer');
    expect(getMarkerMeta(m)).toEqual({ group: 'secondary', rescue: true });
  });

  it('merge() marker, default opts', () => {
    const m = Inertia.merge(() => [1, 2]);
    expect(getMarkerKind(m)).toBe('merge');
    expect(getMarkerMeta(m)).toEqual({ deep: false, prepend: false });
  });

  it('merge() marker, with matchOn (string) + deep', () => {
    const m = Inertia.merge(() => [1], { matchOn: 'id', deep: true });
    expect(getMarkerMeta(m)).toEqual({ matchOn: 'id', deep: true, prepend: false });
  });

  it('merge() marker, with matchOn as string array (Inertia v2 multi-key)', () => {
    const m = Inertia.merge(() => [1], { matchOn: ['id', 'slug'] });
    expect(getMarkerMeta(m)).toEqual({ matchOn: ['id', 'slug'], deep: false, prepend: false });
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

  it('once() marker', () => {
    const m = Inertia.once(() => 'X');
    expect(isMarker(m)).toBe(true);
    expect(getMarkerKind(m)).toBe('once');
  });

  it('once() resolves the wrapped function lazily', async () => {
    let called = false;
    const m = Inertia.once(() => {
      called = true;
      return 42;
    });
    expect(called).toBe(false);
    const fn = getMarkerValue(m);
    expect(await fn()).toBe(42);
    expect(called).toBe(true);
  });

  it('scroll() marker', () => {
    const m = Inertia.scroll(() => ({ data: [] }));
    expect(isMarker(m)).toBe(true);
    expect(getMarkerKind(m)).toBe('scroll');
    expect(getMarkerMeta(m)).toEqual({});
  });

  it('scroll() marker with pageName + matchOn', () => {
    const m = Inertia.scroll(() => ({ data: [] }), { pageName: 'cursor', matchOn: 'id' });
    expect(getMarkerMeta(m)).toEqual({ pageName: 'cursor', matchOn: 'id' });
  });
});
