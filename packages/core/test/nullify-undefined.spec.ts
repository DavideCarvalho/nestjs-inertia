import { describe, expect, it } from 'vitest';
import { nullifyUndefined } from '../src/helpers/nullify-undefined.js';

describe('nullifyUndefined', () => {
  it('replaces undefined at top level with null', () => {
    expect(nullifyUndefined({ a: 1, b: undefined })).toEqual({ a: 1, b: null });
  });

  it('preserves null as null', () => {
    expect(nullifyUndefined({ a: null })).toEqual({ a: null });
  });

  it('does not recurse into objects (top-level only)', () => {
    const result = nullifyUndefined({ nested: { x: undefined } });
    expect(result.nested).toEqual({ x: undefined });
  });

  it('returns empty object for empty input', () => {
    expect(nullifyUndefined({})).toEqual({});
  });
});
