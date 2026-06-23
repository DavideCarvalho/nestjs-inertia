---
"@dudousxd/nestjs-inertia-client": minor
"@dudousxd/nestjs-inertia-codegen": minor
---

Serialize generated response types with `Jsonify<T>` by default.

Over JSON the wire shape of a response differs from the controller's return type — most notably `Date` becomes an ISO `string`, and any `toJSON()` holder collapses to its returned shape. The codegen previously emitted `response` as the raw `Awaited<ReturnType<Controller['method']>>`, so clients were typed against values they never actually receive.

The client package now exports a type-only `Jsonify<T>` that models the result of `JSON.parse(JSON.stringify(value))`: `Date` → `string`, any `toJSON(): R` → `Jsonify<R>`, arrays/tuples recurse element-wise, plain objects recurse per-property (dropping function/symbol/`undefined`-only values while keeping optional properties optional), `Map`/`Set` → `{}`, and primitives/`unknown`/`any` pass through.

The codegen now wraps every emitted `response` type in `Jsonify<...>` by default and adds `import type { Jsonify } from '@dudousxd/nestjs-inertia-client';` to the generated `api.ts`. A new `serialization?: 'json' | 'superjson'` config option (default `'json'`) opts out: set `serialization: 'superjson'` to emit the raw controller return type unchanged for clients that revive payloads (Dates/Maps/Sets) with superjson.
