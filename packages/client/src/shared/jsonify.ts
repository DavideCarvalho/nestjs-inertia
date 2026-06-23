/**
 * `Jsonify<T>` models the value you actually get back on the client after a
 * payload of type `T` has crossed the wire as JSON — i.e. the result of
 * `JSON.parse(JSON.stringify(value))`.
 *
 * The codegen applies this BY DEFAULT to controller response types so the
 * generated `response` type reflects the *serialized* shape rather than the
 * in-process server type. The motivating case is `Date`: a controller that
 * returns `{ createdAt: Date }` produces `{ createdAt: string }` on the wire,
 * because `Date.prototype.toJSON()` emits an ISO string.
 *
 * Design goals (intentionally permissive, NOT `type-fest`-aggressive):
 *  - Transform what JSON genuinely changes (`Date` → `string`, any `toJSON()`
 *    holder → its returned shape, recurse arrays/objects).
 *  - Do NOT reject ordinary interfaces or collapse them to `never`. We never
 *    distribute an object type into `never` just because one property is
 *    non-serializable; we simply drop the non-serializable property.
 *  - Keep optional properties optional. An `x?: T` whose value is absent on the
 *    wire is exactly JSON's "missing key", so the optional modifier is the right
 *    model and is preserved.
 *
 * This is a hand-rolled, type-only utility with no runtime footprint and no
 * external dependency (deliberately not `type-fest`'s `Jsonify`).
 */

/** Primitive value types that JSON round-trips unchanged. */
type JsonPrimitive = string | number | boolean | null;

/**
 * Property keys whose VALUE type cannot appear in JSON output. When a property's
 * value is *only* one of these, `JSON.stringify` omits the key entirely, so we
 * drop it from the serialized object type. (A property that is `T | undefined`
 * via the optional modifier `?` is handled separately — see `JsonifyObject`.)
 */
type NonSerializableValue = ((...args: never[]) => unknown) | symbol | undefined;

/**
 * The set of own property keys to KEEP after serialization: every key whose
 * value type is not *exclusively* non-serializable. `[T[K]] extends
 * [NonSerializableValue]` is the non-distributive form — it asks "is the whole
 * value type assignable to the non-serializable set?" rather than distributing
 * over a union, so `string | undefined` (an optional property) is kept while a
 * bare `() => void` method is dropped.
 */
type SerializableKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [NonSerializableValue] ? never : K;
}[keyof T];

/**
 * Recurse a plain object: keep only serializable keys and `Jsonify` each value.
 * The mapped type copies the optional/`readonly` modifiers from `T`, so an
 * optional property stays optional (its `undefined` arm models JSON's absent
 * key). `Jsonify<T[K]>` strips any leftover `undefined`/function arms inside a
 * union value as part of the recursion.
 */
type JsonifyObject<T> = {
  [K in keyof Pick<T, SerializableKeys<T>>]: Jsonify<T[K]>;
};

/**
 * `Jsonify<T>` — the serialized (wire) form of `T`.
 *
 * Order of the conditional matters:
 *  1. `any`/`unknown` pass straight through (no useful transform, and we must
 *     not accidentally distribute or collapse them).
 *  2. JSON primitives pass through unchanged.
 *  3. Anything with a `toJSON(): R` method serializes to `Jsonify<R>`. This is
 *     the general mechanism that also covers `Date` (whose `toJSON` returns
 *     `string`), so we do not need a dedicated `Date` branch.
 *  4. Arrays/tuples recurse element-wise (`readonly` arrays included via the
 *     `readonly` array branch).
 *  5. `Map`/`Set` stringify to `{}` (they have no enumerable own properties and
 *     no `toJSON`), so we model them as the empty object `{}`. This is a
 *     deliberate, documented approximation — JSON genuinely drops their
 *     contents; we don't try to be cleverer than `JSON.stringify`.
 *  6. Functions/symbols/`undefined` at a value position are not serializable;
 *     they map to `never` (callers reach this only via a union arm — a whole
 *     non-serializable *property* is removed upstream by `SerializableKeys`).
 *  7. Everything else is a plain object → `JsonifyObject`.
 */
export type Jsonify<T> = 0 extends 1 & T // matches `any` only
  ? T
  : unknown extends T // matches `unknown` only (after the `any` guard above)
    ? unknown
    : T extends JsonPrimitive
      ? T
      : // `toJSON` holders (Date, Luxon, Moment, MikroORM entities with toJSON…)
        T extends { toJSON(): infer R }
        ? Jsonify<R>
        : // Tuples / arrays — recurse element types, preserving `readonly`.
          T extends readonly (infer _E)[]
          ? { [K in keyof T]: Jsonify<T[K]> }
          : // Map/Set serialize to `{}` — JSON drops their entries. We model
            // this as `Record<string, never>` (the empty object), the exact
            // shape JSON.stringify produces for Map/Set instances.
            T extends Map<unknown, unknown> | Set<unknown>
            ? Record<string, never>
            : // Bare non-serializable values in a union arm collapse to `never`.
              T extends NonSerializableValue
              ? never
              : // Plain object → recurse properties, dropping unserializable ones.
                T extends object
                ? JsonifyObject<T>
                : T;
