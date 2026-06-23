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

  it('transforms Date inside a union with null (Date | null → string | null)', () => {
    expectTypeOf<Jsonify<Date | null>>().toEqualTypeOf<string | null>();
  });

  it('handles a self-referential recursive type without infinite recursion', () => {
    interface Tree {
      value: Date;
      children: Tree[];
    }
    // Compiles (regression guard) and the leaf Date is serialized to string.
    expectTypeOf<Jsonify<Tree>['value']>().toEqualTypeOf<string>();
  });

  it('keeps an any-valued property (not dropped)', () => {
    type Input = { x: any };
    expectTypeOf<Jsonify<Input>>().toHaveProperty('x');
  });

  it('keeps an unknown-valued property (not dropped)', () => {
    type Input = { y: unknown };
    expectTypeOf<Jsonify<Input>>().toHaveProperty('y');
  });

  it('keeps any and unknown while dropping a function property', () => {
    type Input = { x: any; y: unknown; z: () => void };
    type Result = Jsonify<Input>;
    expectTypeOf<Result>().toHaveProperty('x');
    expectTypeOf<Result>().toHaveProperty('y');
    expectTypeOf<Result>().not.toHaveProperty('z');
  });

  it('transforms an index signature value (Record<string, Date> → Record<string, string>)', () => {
    expectTypeOf<Jsonify<Record<string, Date>>>().toEqualTypeOf<Record<string, string>>();
  });

  it('transforms a readonly array element (readonly Date[] → readonly string[])', () => {
    expectTypeOf<Jsonify<readonly Date[]>>().toEqualTypeOf<readonly string[]>();
  });

  it('collapses bigint to never (no JSON wire representation)', () => {
    expectTypeOf<Jsonify<bigint>>().toEqualTypeOf<never>();
  });

  it('keeps optional under nesting ({ a?: { b: Date } } → { a?: { b: string } })', () => {
    type Input = { a?: { b: Date } };
    type Expected = { a?: { b: string } };
    expectTypeOf<Jsonify<Input>>().toEqualTypeOf<Expected>();
  });
});
