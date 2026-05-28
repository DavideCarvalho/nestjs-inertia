---
"@dudousxd/nestjs-inertia-codegen": patch
---

Four fixes that surfaced while wiring up `typecheck:inertia` in flip-nestjs:

- **Inline type-alias bodies**. Resolve a type alias's underlying type node recursively in `resolveTypeNodeToString` so that aliases like `type ExportBody = ExportWorkOrderBody | ExportSubwoItemsBody | ...` get expanded inline. Previously the bare identifiers leaked into the generated `api.ts`, producing `Cannot find name 'ExportWorkOrderBody'` errors.
- **Union/intersection node handling**. Add explicit branches for `UnionTypeNode` / `IntersectionTypeNode` / `ParenthesizedTypeNode` so each member gets resolved recursively (previously they fell through to the raw text branch).
- **Skip non-page files in page discovery**. Filter out `*.test.{ts,tsx,js,jsx}`, `*.spec.*`, and `*.stories.*` / `*.story.*` from `discoverPages` so vitest and storybook neighbours of real Inertia pages don't get registered. Without this, callers' test files were getting pulled into the codegen's typecheck graph.
- **Optional body in mutationFn when there is no `@Body()`**. When the controller has no body param the codegen now emits `body?: never` in the mutation input so callers can pass `{ params }` directly instead of `{ params, body: undefined as never }`.
- **Unwrap MikroORM wrappers**. `Ref<T>` / `Reference<T>` / `LoadedReference<T>` / `IdentifiedReference<T>` reduce to `T`, `Collection<T>` reduces to `Array<T>`, and `Opt<T>` / `Loaded<T, ...>` reduce to `T`. These are server-side wrappers that don't show up on the JSON wire and were forcing client code to deal with class-shaped Reference types it can't actually call methods on.
- **Cast `query` to `Record<string, unknown>` in the fetcher call**. When the controller's query param is typed as a class DTO, TS won't let it flow into the fetcher's `Record<string, unknown>` query slot without a cast. Add the cast inside the generated `queryOptions` template (matching what `infiniteQueryOptions` already did).
