import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Inertia,
  _resetLazyDeprecationWarning,
  getMarkerKind,
  getMarkerMeta,
  getMarkerValue,
  isMarker,
} from '../src/markers.js';

describe('Inertia markers', () => {
  beforeEach(() => {
    _resetLazyDeprecationWarning();
  });

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

  it('merge() marker, with matchOn (string) + deep', () => {
    const m = Inertia.merge(() => [1], { matchOn: 'id', deep: true });
    expect(getMarkerMeta(m)).toEqual({ matchOn: 'id', deep: true });
  });

  it('merge() marker, with matchOn as string array (Inertia v2 multi-key)', () => {
    const m = Inertia.merge(() => [1], { matchOn: ['id', 'slug'] });
    expect(getMarkerMeta(m)).toEqual({ matchOn: ['id', 'slug'], deep: false });
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

  it('Inertia.lazy is a deprecated alias for optional (v3: warns once, returns optional marker)', async () => {
    const { Logger } = await import('@nestjs/common');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      const m1 = Inertia.lazy(() => 'x');
      const m2 = Inertia.lazy(() => 'y');
      expect(getMarkerKind(m1)).toBe('optional');
      expect(getMarkerKind(m2)).toBe('optional');
      // Warning emitted exactly once (not on every call)
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Inertia.lazy() is deprecated'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Inertia.optional()'));
    } finally {
      warnSpy.mockRestore();
    }
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
});
