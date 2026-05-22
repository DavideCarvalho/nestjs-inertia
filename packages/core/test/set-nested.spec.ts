import { describe, it, expect } from 'vitest';
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
    expect(() => setNested(target as Record<string, unknown>, ['user', 'name'], 'X'))
      .toThrow(/conflict/i);
  });
});

describe('unpackDotKeys', () => {
  it('unpacks dot-notation top-level keys', () => {
    expect(unpackDotKeys({ 'user.name': 'A', 'user.age': 30, plain: 1 }))
      .toEqual({ user: { name: 'A', age: 30 }, plain: 1 });
  });

  it('leaves non-dot keys untouched', () => {
    expect(unpackDotKeys({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('throws when a dot key conflicts with a non-dot key with same parent', () => {
    expect(() => unpackDotKeys({ user: 'X', 'user.name': 'Y' }))
      .toThrow(/conflict/i);
  });
});
