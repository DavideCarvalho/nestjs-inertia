---
"@dudousxd/nestjs-inertia-codegen": minor
---

Two related drops in one release: codegen fixes that surfaced while
wiring up `typecheck:inertia` in a real project, plus init/doctor
scaffolding so future projects don't have to reverse-engineer the setup.

## Codegen fixes

- **Inline type-alias bodies**. Resolve a type alias's underlying type node recursively in `resolveTypeNodeToString` so that aliases like `type ExportBody = ExportWorkOrderBody | ExportSubwoItemsBody | ...` get expanded inline. Previously the bare identifiers leaked into the generated `api.ts`, producing `Cannot find name 'ExportWorkOrderBody'` errors.
- **Union/intersection node handling**. Add explicit branches for `UnionTypeNode` / `IntersectionTypeNode` / `ParenthesizedTypeNode` so each member gets resolved recursively (previously they fell through to the raw text branch).
- **Skip non-page files in page discovery**. Filter out `*.test.{ts,tsx,js,jsx}`, `*.spec.*`, and `*.stories.*` / `*.story.*` from `discoverPages` so vitest and storybook neighbours of real Inertia pages don't get registered. Without this, callers' test files were getting pulled into the codegen's typecheck graph.
- **Optional body in mutationFn when there is no `@Body()`**. When the controller has no body param the codegen now emits `body?: never` in the mutation input so callers can pass `{ params }` directly instead of `{ params, body: undefined as never }`.
- **Unwrap MikroORM wrappers**. `Ref<T>` / `Reference<T>` / `LoadedReference<T>` / `IdentifiedReference<T>` reduce to `T`, `Collection<T>` reduces to `Array<T>`, and `Opt<T>` / `Loaded<T, ...>` reduce to `T`. These are server-side wrappers that don't show up on the JSON wire and were forcing client code to deal with class-shaped Reference types it can't actually call methods on.
- **Cast `query` to `Record<string, unknown>` in the fetcher call**. When the controller's query param is typed as a class DTO, TS won't let it flow into the fetcher's `Record<string, unknown>` query slot without a cast. Add the cast inside the generated `queryOptions` template (matching what `infiniteQueryOptions` already did).

## init + doctor: tsconfig.inertia.json scaffolding

`nestjs-inertia init` now scaffolds the dedicated frontend typecheck setup:

- **`tsconfig.inertia.json`** at the project root. Pre-wired with `@/*` → `["./inertia/*", "./src/*"]` so codegen-resolved controllers (which use `@/` to mean `src/`) and inertia user code (which uses `@/` to mean `inertia/`) both resolve from the same alias. `experimentalDecorators: true` (codegen has to parse imported controllers) and `emitDecoratorMetadata: false` (otherwise every src/ file transitively pulled in spams TS1272). Excludes test/spec files and `dist`.
- **`inertia/tsconfig.json`** — thin `extends "../tsconfig.inertia.json"` so VSCode (and any editor that walks up looking for the closest tsconfig) picks up the inertia-aware aliases automatically when opening files in `inertia/`.
- **`typecheck:inertia` script** in `package.json` — `tsc --noEmit -p tsconfig.inertia.json`.
- **`dist` added to the root `tsconfig.json` `exclude`** so the server typecheck doesn't walk compiled artifacts under `dist/inertia/*` and surface thousands of phantom unresolved-alias errors.

`nestjs-inertia doctor` adds matching checks (all auto-fixable with `--fix`):

- `tsconfig.json` excludes `dist/`
- `tsconfig.inertia.json` exists, has `~/*` / `~codegen/*` / `@/*` (with both `./inertia/*` and `./src/*`), `experimentalDecorators: true`, `emitDecoratorMetadata: false`, includes `nestjs-inertia.d.ts`
- `inertia/tsconfig.json` exists
- `package.json` has the `typecheck:inertia` script
