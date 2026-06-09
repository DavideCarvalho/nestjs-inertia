---
"@dudousxd/nestjs-inertia-codegen": minor
---

Type-aware filter query codegen. When an endpoint uses `@ApplyFilter`, the generated
`filterQuery()` factory and the route `query` type now carry a per-field type map, so
the client builder type-checks operators and values per field. Field types are
resolved from entity columns and from `@FilterFor` method parameter types (named
enums/aliases emitted as real `import type` references; non-exported enums expanded to
literals), with explicit `@FilterFor('key', { type })` hints taking precedence. Both
emit positions are rendered from a single source so they can't diverge. Numeric enums
now resolve to their values (`1 | 2`) instead of member names.
