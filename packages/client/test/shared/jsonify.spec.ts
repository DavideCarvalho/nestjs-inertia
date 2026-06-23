/**
 * Type-level tests for `Jsonify<T>` — the serialized (wire) form of a type.
 * These assertions are checked at compile time by vitest's `expectTypeOf`.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Jsonify } from '../../src/shared/jsonify.js';

describe('Jsonify', () => {
  it('turns Date into string and recurses nested objects', () => {
    type Input = { a: Date; b: { c: Date }; d: string };
    type Expected = { a: string; b: { c: string }; d: string };
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });

  it('recurses array element types (Date → string per element)', () => {
    type Input = { created: Date }[];
    type Expected = { created: string }[];
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });

  it('leaves JSON primitives unchanged', () => {
    expectTypeOf<Jsonify<string>>().toEqualTypeOf<string>();
    expectTypeOf<Jsonify<number>>().toEqualTypeOf<number>();
    expectTypeOf<Jsonify<boolean>>().toEqualTypeOf<boolean>();
    expectTypeOf<Jsonify<null>>().toEqualTypeOf<null>();
  });

  it('keeps optional properties optional', () => {
    type Input = { id: string; createdAt?: Date };
    type Expected = { id: string; createdAt?: string };
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });

  it('drops function-valued properties (not serializable)', () => {
    type Input = { id: string; compute: () => number };
    type Expected = { id: string };
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });

  it('preserves tuple shape while transforming elements', () => {
    type Input = [Date, string];
    type Expected = [string, string];
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });

  it('follows any toJSON() holder to its returned shape', () => {
    type Money = { toJSON(): { amount: number; currency: string } };
    type Expected = { amount: number; currency: string };
    expectTypeOf<Jsonify<Money>>().toEqualTypeOf<Expected>();
  });

  it('passes unknown and any through', () => {
    expectTypeOf<Jsonify<unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<Jsonify<any>>().toBeAny();
  });

  it('models Map/Set as the empty object JSON.stringify produces', () => {
    expectTypeOf<Jsonify<Map<string, number>>>().toEqualTypeOf<Record<string, never>>();
    expectTypeOf<Jsonify<Set<number>>>().toEqualTypeOf<Record<string, never>>();
  });
});
