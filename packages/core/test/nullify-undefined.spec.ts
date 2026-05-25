import { describe, expect, it } from 'vitest';
import { nullifyUndefined } from '../src/helpers/nullify-undefined.js';

describe('nullifyUndefined', () => {
  it('replaces undefined at top level with null', () => {
    expect(nullifyUndefined({ a: 1, b: undefined })).toEqual({ a: 1, b: null });
  });

  it('preserves null as null', () => {
    expect(nullifyUndefined({ a: null })).toEqual({ a: null });
  });

  it('recurses into nested objects', () => {
    const result = nullifyUndefined({ nested: { x: undefined } });
    expect(result.nested).toEqual({ x: null });
  });

  it('recurses into deeply nested objects', () => {
    const result = nullifyUndefined({ a: { b: { c: undefined, d: 1 } } });
    expect(result).toEqual({ a: { b: { c: null, d: 1 } } });
  });

  it('handles arrays with undefined values', () => {
    const result = nullifyUndefined({ items: [1, undefined, 'a'] });
    expect(result).toEqual({ items: [1, null, 'a'] });
  });

  it('handles arrays with nested objects containing undefined', () => {
    const result = nullifyUndefined({ items: [{ x: undefined }] });
    expect(result).toEqual({ items: [{ x: null }] });
  });

  it('returns empty object for empty input', () => {
    expect(nullifyUndefined({})).toEqual({});
  });
});
