import { describe, expect, it } from 'vitest';
import { setNested, unpackDotKeys } from '../src/helpers/set-nested.js';

describe('setNested', () => {
  it('sets a single-level key', () => {
    const target = {};
    setNested(target, ['a'], 1);
    expect(target).toEqual({ a: 1 });
  });

  it('sets a nested 2-level key', () => {
    const target = {};
    setNested(target, ['user', 'name'], 'Alice');
    expect(target).toEqual({ user: { name: 'Alice' } });
  });

  it('sets a deeply-nested key', () => {
    const target = {};
    setNested(target, ['a', 'b', 'c', 'd'], 'deep');
    expect(target).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });

  it('preserves sibling keys when creating intermediates', () => {
    const target: Record<string, unknown> = { other: 'value' };
    setNested(target, ['user', 'name'], 'X');
    expect(target).toEqual({ other: 'value', user: { name: 'X' } });
  });

  it('throws when intermediate path conflicts with existing non-object', () => {
    const target = { user: 'string-value' };
    expect(() => setNested(target as Record<string, unknown>, ['user', 'name'], 'X')).toThrow(
      /conflict/i,
    );
  });
});

describe('unpackDotKeys', () => {
  it('unpacks dot-notation top-level keys', () => {
    expect(unpackDotKeys({ 'user.name': 'A', 'user.age': 30, plain: 1 })).toEqual({
      user: { name: 'A', age: 30 },
      plain: 1,
    });
  });

  it('leaves non-dot keys untouched', () => {
    expect(unpackDotKeys({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('throws when a dot key conflicts with a non-dot key with same parent', () => {
    expect(() => unpackDotKeys({ user: 'X', 'user.name': 'Y' })).toThrow(/conflict/i);
  });
});

// M-1: Prototype pollution protection
describe('setNested — prototype pollution prevention', () => {
  it('throws when path contains __proto__', () => {
    const target: Record<string, unknown> = {};
    expect(() => setNested(target, ['__proto__', 'polluted'], true)).toThrow(/Disallowed/i);
  });

  it('throws when path contains prototype', () => {
    const target: Record<string, unknown> = {};
    expect(() => setNested(target, ['prototype', 'polluted'], true)).toThrow(/Disallowed/i);
  });

  it('throws when path contains constructor', () => {
    const target: Record<string, unknown> = {};
    expect(() => setNested(target, ['constructor', 'polluted'], true)).toThrow(/Disallowed/i);
  });

  it('throws when __proto__ is the final segment', () => {
    const target: Record<string, unknown> = {};
    expect(() => setNested(target, ['a', '__proto__'], true)).toThrow(/Disallowed/i);
  });

  it('does NOT pollute Object.prototype even when called directly', () => {
    const target: Record<string, unknown> = {};
    expect(() => setNested(target, ['__proto__', 'polluted'], true)).toThrow();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('legitimate keys still work after adding the guard', () => {
    const target: Record<string, unknown> = {};
    setNested(target, ['user', 'name'], 'Alice');
    expect(target).toEqual({ user: { name: 'Alice' } });
  });
});
