---
"@dudousxd/nestjs-inertia-codegen": patch
---

Harden `forms.ts` (Path B, class-validator → zod) generation so it never emits
TypeScript that fails to compile. Validated against a large real-world DTO set.

Fixes three root causes that produced invalid output:

- **Duplicate hoisted nested schemas (`TS2451` redeclaration).** A nested DTO
  referenced by multiple endpoints (e.g. a shared `ColumnFilterSchema` or the
  pri-buy `*DtoSchema` configs) was emitted once per parent. Nested schemas are
  now hoisted into a single shared block and declared exactly once, then
  referenced everywhere.
- **Recursive types emitted without annotation (`TS7022`/`TS7024`).** A
  self-referential schema was emitted as `const X = z.lazy(() => … X …)` with no
  type annotation → implicit `any`. Recursive schemas are now degraded to a
  valid `z.unknown() /* recursive type — not expanded */` placeholder.
- **Unresolvable `@IsEnum` emitting an un-imported identifier (`TS2304`).** When
  an enum could not be resolved to literal members it fell back to
  `z.nativeEnum(SomeEnum)`, referencing a name that is never imported into the
  generated file. Enum resolution now follows `export { … } from` / bare
  `export { … }` re-export chains (so re-exported enums resolve to
  `z.enum([…])`); when still unresolvable it degrades to `z.unknown()` with a
  comment instead of a dangling identifier.

Same-name/different-shape nested schemas are detected and disambiguated (a
suffixed `Name_2`, with that endpoint's references rewritten) so two unrelated
types sharing a TS name never collapse into one wrong schema. Across all cases
the generator now follows the existing policy: when a type cannot be cleanly
translated, emit a degraded-but-valid `z.unknown()` with a `/* … */` comment
rather than invalid TypeScript.
