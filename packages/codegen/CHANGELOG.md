# Changelog — @dudousxd/nestjs-inertia-codegen

## 1.12.0

### Minor Changes

- [`9606527`](https://github.com/DavideCarvalho/nestjs-inertia/commit/9606527b3944cc623da5bfc1b126428845af938c) - Serialize generated response types with `Jsonify<T>` by default.

  Over JSON the wire shape of a response differs from the controller's return type — most notably `Date` becomes an ISO `string`, and any `toJSON()` holder collapses to its returned shape. The codegen previously emitted `response` as the raw `Awaited<ReturnType<Controller['method']>>`, so clients were typed against values they never actually receive.

  The client package now exports a type-only `Jsonify<T>` that models the result of `JSON.parse(JSON.stringify(value))`: `Date` → `string`, any `toJSON(): R` → `Jsonify<R>`, arrays/tuples recurse element-wise, plain objects recurse per-property (dropping function/symbol/`undefined`-only values while keeping optional properties optional), `Map`/`Set` → `{}`, and primitives/`unknown`/`any` pass through.

  The codegen now wraps every emitted `response` type in `Jsonify<...>` by default and adds `import type { Jsonify } from '@dudousxd/nestjs-inertia-client';` to the generated `api.ts`. A new `serialization?: 'json' | 'superjson'` config option (default `'json'`) opts out: set `serialization: 'superjson'` to emit the raw controller return type unchanged for clients that revive payloads (Dates/Maps/Sets) with superjson.

## 1.11.4

### Patch Changes

- [`c70b423`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c70b4236bb86efae43e8dd7060582c3ac16dfcbb) - Resolve `@Filterable` entities imported from node_modules packages.

  `resolveModuleSpecifier` only handled relative imports and tsconfig path aliases, so an `@ApplyFilter` whose filter's `@Filterable({ entity: X })` referenced an entity published in a dependency (rather than declared in `src/`) failed to resolve. The endpoint was then mis-emitted as a non-filter route — `body: never`, no `.filterQuery()` builder — and the generated client POSTed an empty body, silently dropping the consumer's filter/sort/pagination.

  Bare package specifiers now resolve to their declaration files: a new `resolveBarePackageTypes` walks `node_modules` upward from the importing file, reads the package's `package.json` (`exports` conditions, then top-level `types`/`typings`), and falls back to conventional layouts (`<sub>.d.ts`, `dist/index.d.ts`). The package directory is located on disk rather than via `require.resolve('<pkg>/package.json')`, which `exports` encapsulation otherwise blocks.

## 1.11.3

### Patch Changes

- [`d40e23e`](https://github.com/DavideCarvalho/nestjs-inertia/commit/d40e23ed3860d8499d9042bef836cabc26232a84) - Fix: nested `once()` markers now mirror top-level `once()` semantics — they re-resolve only on a full reload or when their key is explicitly reset (was incorrectly gated on `subKeep === null`).

  Internal refactors (behavior-preserving): share the method-spoof rule across Express and Fastify, collapse the handlebars/ejs/pug/liquid template-engine adapters into one `createTemplateEngineAdapter` factory, route the validation filter through the request adapter (inject `HttpAdapterHost`, drop the bespoke `sendRedirect`), and extract `zodAstToTs` + route-name helpers out of `contracts-fast`.

## 1.11.2

### Patch Changes

- [`1f57e24`](https://github.com/DavideCarvalho/nestjs-inertia/commit/1f57e244f40ad9ae547ee540f7406df2b1f6775e) - Harden `forms.ts` (Path B, class-validator → zod) generation so it never emits
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

## 1.11.1

### Patch Changes

- [`5b44a38`](https://github.com/DavideCarvalho/nestjs-inertia/commit/5b44a388debfe44d9647420fdddab32c66094708) - Fix `forms.ts` generation producing invalid TypeScript when a DTO has an
  unmappable class-validator decorator (`@Transform`, `@IsDateString`,
  `@IsNotEmptyObject`, etc.). The "not translatable" note was emitted as a `//`
  line comment inline in the single-line `z.object({ … })`, which swallowed the
  closing `})` and any following fields. It is now a `/* … */` block comment.

## 1.11.0

### Minor Changes

- [`4395608`](https://github.com/DavideCarvalho/nestjs-inertia/commit/439560897a20f84068f94d4402fc196b92367624) - Type-aware filter query codegen. When an endpoint uses `@ApplyFilter`, the generated
  `filterQuery()` factory and the route `query` type now carry a per-field type map, so
  the client builder type-checks operators and values per field. Field types are
  resolved from entity columns and from `@FilterFor` method parameter types (named
  enums/aliases emitted as real `import type` references; non-exported enums expanded to
  literals), with explicit `@FilterFor('key', { type })` hints taking precedence. Both
  emit positions are rendered from a single source so they can't diverge. Numeric enums
  now resolve to their values (`1 | 2`) instead of member names.

- [`47deaa6`](https://github.com/DavideCarvalho/nestjs-inertia/commit/47deaa6fef3d6485b32ce001d4c5e2ef39b54704) - Emit `forms.ts` with zod schemas per validated endpoint (Path A — contract
  reuse). `defineContract` bodies/queries are re-exported when bound to an
  exported named const, else inlined verbatim. Adds `<Pascal>BodySchema` /
  `<Pascal>QuerySchema` consts, `z.infer` type aliases, a `formSchemas` name→schema
  map, collision-aliasing, and a `forms` config block (`enabled`, `watch`,
  `zodImport`). Wired into `generate()`, the watcher, and the index export.

- [`56e0415`](https://github.com/DavideCarvalho/nestjs-inertia/commit/56e04152cb5e403f0149c0c7d6a91c3a1d065986) - Translate class-validator-decorated DTO classes into zod schemas via pure AST
  reading (Path B). Implements the full decorator→zod mapping table
  (`@IsEmail`→`.email()`, `@MinLength`→`.min()`, `@IsEnum`→`z.enum`/`z.nativeEnum`,
  `@ValidateNested`+`@Type`→hoisted nested schemas, arrays, custom `{ message }`,
  etc.), with `z.lazy()` recursion guards and skip-+-warn for unmappable decorators
  (`@IsStrongPassword`, custom validators). A `defineContract` schema always takes
  precedence; synthesis only runs on the plain-verb path. No class-validator
  runtime dependency.

- [`bdf8e49`](https://github.com/DavideCarvalho/nestjs-inertia/commit/bdf8e49fe24b85a38a218058632963fb233361d9) - Watch DTO globs (`forms.watch`, default `src/**/*.dto.ts`) so `*.dto.ts` changes
  re-emit `forms.ts`. Forms emit now inlines contract zod text by default (instead
  of re-exporting from the controller) so server-only deps never leak into the
  client bundle. Also resolves relative `./x.dto.js` imports to `x.dto.ts`
  (NodeNext style) when following DTO references across files.

## 1.10.0

### Minor Changes

- [#18](https://github.com/DavideCarvalho/nestjs-inertia/pull/18) [`f6d74dc`](https://github.com/DavideCarvalho/nestjs-inertia/commit/f6d74dcb24566d8f5d8f662079aaa9c0562aac18) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Add `Route.FilterFields<K>` / `Path.FilterFields<M, U>` type helpers.

  Each `ApiRouter` leaf now carries a `filterFields` member — the string-literal
  union of a route's filterable fields when it uses `@dudousxd/nestjs-filter`
  (`@ApplyFilter` + a `@Filterable` class), or `never` otherwise. The new
  `Route.FilterFields<'pipelineRuns.search'>` helper resolves that union by route
  name (and `Path.FilterFields<'POST', '/api/...'>` by method+url), mirroring the
  existing `Route.Response`/`Body`/`Query`/`Params`/`Error` helpers.

  This replaces the awkward
  `Parameters<ReturnType<typeof api.x.y.filterQuery>['where']>[0]` trick callers
  were using to recover the field union for things like validating dynamic
  data-grid column ids before handing them to the builder.

  The helper is purely type-level: the `filterFields` union is baked into the
  generated `ApiRouter`, so it does **not** require `@dudousxd/nestjs-filter` (or
  its client) to be installed. Routes without a filter simply resolve to `never`.

## 1.9.2

### Patch Changes

- Updated dependencies [[`118b9ea`](https://github.com/DavideCarvalho/nestjs-inertia/commit/118b9ea56da709784dd6608a62f06caf4115f9bd)]:
  - @dudousxd/nestjs-inertia@1.4.5

## 1.9.1

### Patch Changes

- Updated dependencies [[`5c62550`](https://github.com/DavideCarvalho/nestjs-inertia/commit/5c6255070fe8dcb246a7f79c81f6a23f0395c68b)]:
  - @dudousxd/nestjs-inertia@1.4.4

## 1.9.0

### Minor Changes

- [`48e5f4a`](https://github.com/DavideCarvalho/nestjs-inertia/commit/48e5f4ade15224afff6808730ef66c4669ce848f) - Two related drops in one release: codegen fixes that surfaced while
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

## 1.8.0

### Minor Changes

- [`4e7b807`](https://github.com/DavideCarvalho/nestjs-inertia/commit/4e7b807c8cbe4d8f003b5edfa76588d89cfb00c3) - init: configure nest-cli.json to copy shell template to dist/ and use resolve(\_\_dirname) for rootView so Docker images that only ship dist/ include the template. doctor: validate shell template exists and nest-cli.json asset config is present.

## 1.7.2

### Patch Changes

- Support `autoFields` in `@Filterable` — when the filter class has no explicit properties, the codegen resolves fields from the entity class referenced in `@Filterable({ entity: X })`. Traverses relations recursively to generate dot-notation fields (e.g. `tasks.status`). Also reads `@Relations` decorator keys.

## 1.7.1

### Patch Changes

- Updated dependencies [[`995cc13`](https://github.com/DavideCarvalho/nestjs-inertia/commit/995cc131b00bcf8aa45d36fc66b9cf9453125efa)]:
  - @dudousxd/nestjs-inertia@1.4.2

## 1.7.0

### Minor Changes

- [`7541d51`](https://github.com/DavideCarvalho/nestjs-inertia/commit/7541d5121a080bda97dae4d756d0e14b5bc65519) - Typed shared props from forRoot({ share }), typed navigate(), prefetch on hover for Link, useTypedReload for partial reloads.

## 1.6.0

### Minor Changes

- [`284a3e3`](https://github.com/DavideCarvalho/nestjs-inertia/commit/284a3e31c1935d9d104a128a7a8310648d09a395) - Typed navigate() for type-safe router.visit() with route name autocomplete. Prefetch on hover for Link component (React, Vue, Svelte). useTypedReload for typed partial reloads.

## 1.5.1

### Patch Changes

- [`14b181d`](https://github.com/DavideCarvalho/nestjs-inertia/commit/14b181df0439d1fd82af3ace8fddcf73720bffc2) - Fix "process is not defined" in browser by moving server-only exports (ApplyContract, As, ContractValidationPipe) to @dudousxd/nestjs-inertia-client/server subpath. Add useTypedReload for typed partial reloads.

## 1.5.0

### Minor Changes

- [`f26eeed`](https://github.com/DavideCarvalho/nestjs-inertia/commit/f26eeedda2332be07ac835c9aa1c601396befa3e) - Integrate with @dudousxd/nestjs-filter: detect @ApplyFilter(FilterClass) on controller parameters and generate TypedFilterQuery with typed field names. Routes with filters get a filterQuery() helper that returns a typed FilterQueryBuilder.

## 1.4.1

### Patch Changes

- [`15b8d5a`](https://github.com/DavideCarvalho/nestjs-inertia/commit/15b8d5ace084307fd5e2f7e502085f83d13a3632) - Infer page props from default export via Parameters, no ComponentProps export needed. Fix React-not-defined in vitest by using explicit createElement.

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.4.1

## 2.0.0

### Minor Changes

- feat: type-safe @Inertia, Props E2E, infiniteQueryOptions, URL params, doctor CLI, codegen HMR

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.0

## 2.0.0

### Minor Changes

- feat(codegen): ReturnType<import(...)> for response types, queryKey helper, TanStack helpers, type ref imports, path alias resolution, debug mode

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.0

## 3.0.0

### Minor Changes

- feat(codegen): import type references from source instead of inline expansion — eliminates unknown fields from depth limits

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@3.0.0

## 2.0.1

### Patch Changes

- fix(codegen): remove @tanstack/query-core dependency — generated api.ts uses plain object literals

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.1

## 2.0.0

### Minor Changes

- feat(codegen): add queryKey() helper for typed cache invalidation — api.crew.getCrew.queryKey()

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.0

## 1.0.7

### Patch Changes

- fix(core): use data-page="app" attribute on script tag for Inertia v3 protocol compatibility

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.0.7

## 1.0.6

### Patch Changes

- fix(codegen): resolve interfaces, type aliases, and enums — not just classes. Conditional @tanstack/query-core import.

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.0.6

## 1.0.5

### Patch Changes

- fix(codegen): consistent camelCase route names for all routes (not just @ApplyContract)

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.0.5

## 1.0.4

### Patch Changes

- fix(codegen): resolve DTOs imported from separate files — cross-file class resolution via ts-morph import following

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.0.4

## 1.0.3

### Patch Changes

- [`c79cc6d`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c79cc6dad64342bce17c28a705ae27911c3f4c74) - Fix React Refresh preamble in @vite directive, watcher initial pass runs full discovery, auto-sync VERSION constants

- Updated dependencies [[`c79cc6d`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c79cc6dad64342bce17c28a705ae27911c3f4c74)]:
  - @dudousxd/nestjs-inertia@1.0.3

## 1.0.2

### Patch Changes

- [`27e0bab`](https://github.com/DavideCarvalho/nestjs-inertia/commit/27e0bab4b7f8752a4dd179cc715b4e3d64161624) - Fix: @vite directive includes React Refresh preamble, watcher initial pass runs full route+contract discovery from DTOs

- Updated dependencies [[`27e0bab`](https://github.com/DavideCarvalho/nestjs-inertia/commit/27e0bab4b7f8752a4dd179cc715b4e3d64161624)]:
  - @dudousxd/nestjs-inertia@1.0.2

## 1.0.1

### Patch Changes

- [`a33c81b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a33c81b0a53077559b1f9433824cfaee1b01c80c) - Fix: @vite directive includes React Refresh preamble in dev, watcher initial pass runs full route+contract discovery

- Updated dependencies [[`a33c81b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a33c81b0a53077559b1f9433824cfaee1b01c80c)]:
  - @dudousxd/nestjs-inertia@1.0.1

## 1.0.0

### Minor Changes

- [`c5878e3`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c5878e3f8827d9e89710df0154ea76996b6db62a) - First public release — Inertia.js v3 adapter for NestJS.

  - Core: InertiaModule.forRoot/forRootAsync/forFeature, @Inertia decorator, Inertia.optional/defer/merge/always markers, CSRF with tokenContext, SSR support, Express + Fastify adapters
  - Vite: setupInertiaVite + nestInertia plugin, @inertia/@vite/@inertiaHead shell directives
  - Codegen: nestjs-inertia init (full scaffold + auto-patch), auto-watch in dev, static AST discovery, class-validator DTO support, Route/Path type helpers, @As hierarchical naming
  - Client: defineContract + @ApplyContract, typed Link for React/Vue/Svelte with context providers, createFetcher, SSR hydration, rich error messages
  - Testing: expectInertia matchers, assertInertia, InertiaTestingModule, fakes

### Patch Changes

- Updated dependencies [[`c5878e3`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c5878e3f8827d9e89710df0154ea76996b6db62a)]:
  - @dudousxd/nestjs-inertia@1.0.0

## [Unreleased]

### Removed

- **Heavy probe path deleted** — `discoverRoutes` (fork + tsx + real Nest bootstrap) and the associated `probe.ts` child-process script have been removed. Static AST discovery via ts-morph is now the only route-discovery strategy.
- `useStaticDiscovery` config field removed from `ContractsConfig` / `ResolvedContractsConfig` — there is no longer an alternative.
- `tsconfig.probe.json` removed from the package.
- `NESTJS_INERTIA_CODEGEN_PROBE` environment-variable guard removed from `@dudousxd/nestjs-inertia` core module (the probe child process no longer exists).

## 0.9.0-alpha.0 — 2026-05-22

### Changed

- Version bump to `0.9.0-alpha.0` (Inertia v3 monorepo coordination; no source changes)

## 0.8.0-alpha.0 — 2026-05-22

### Added

- **`RouteParamsMap` emission** — codegen now emits a `RouteParamsMap` mapped type alongside `routes.ts`; `init` augments `InertiaRegistry` with the `routes` property automatically
- **ts-morph static AST contract discovery** — contract metadata is now extracted via ts-morph's static AST traversal instead of a dynamic child-process bootstrap probe; approximately 20× faster cold start and no side effects from running the NestJS app
- **Watch covers contracts** — `--watch` mode now monitors controller/contract source files and re-emits `api.ts` on change
- **`init` augmentation update** — `nestjs-inertia init` now scaffolds `InertiaRegistry` augmentation that includes `routes: RouteParamsMap` for typed `Link` and `route()` usage

### Changed

- Version bump to `0.8.0-alpha.0`

## 0.7.0-alpha.0 — 2026-05-22

### Changed

- Bundled with example app, CI workflows, Changesets, MIT LICENSE, and slim docs.

## [0.6.0-alpha.0] - 2026-05-22

### Added

- **Contract discovery** — `discoverContracts(opts)` reads `CONTRACT_METADATA` via the Nest bootstrap probe to collect all `@ApplyContract`-decorated handler contracts; returns `ContractDescriptor[]` (method, path, name, query/body/response schema shapes)
- **`api.ts` emission** — `emitApi(contracts, outDir)` writes `.nestjs-inertia/api.ts`: a `createApi(opts?)` factory returning a typed route tree built on `@dudousxd/nestjs-inertia-client`'s `createFetcher`; no file is emitted when no contracts are found
- `generate(config)` orchestrates contract discovery + `emitApi` alongside existing page/route/index emitters

### Changed

- Version bump to `0.6.0-alpha.0`

## [0.5.0-alpha.0] - 2026-05-22

### Added

- Initial release of `@dudousxd/nestjs-inertia-codegen`
- **Config layer** — `defineConfig` helper + `loadConfig(cwd)` with tsx ESM loader; `ConfigError` for missing file / invalid export / validation failure
- **Page discovery** — `discoverPages(opts)` via fast-glob; extracts `ComponentProps` type body by brace-counting; supports `relative-no-ext`, `kebab`, and custom name strategies
- **Route discovery** — `discoverRoutes(opts)` via child-process Nest bootstrap (tsx probe); returns `RouteDescriptor[]` with method, path, params
- **Emitters**
  - `emitPages(pages, outDir)` — writes `pages.d.ts` with `InertiaPages` interface (page name → props type, `unknown` for pages without props)
  - `emitRoutes(routes, outDir)` — writes `routes.ts` with runtime `route(name, params?)` interpolator, `RouteName` union, `RouteParams<K>` template-literal mapped type
  - `emitCache(pages, outDir)` — writes `components.json` cache manifest (name, relativePath, mtime)
  - `emitIndex(outDir)` — writes `index.d.ts` barrel re-exporting pages, shared-props, routes
- **`generate(config)`** — orchestrates discovery + all emitters in one call
- **Watch mode** — `watch(config, onChange?)` via chokidar (150 ms debounce); returns `{ close() }`. Lock-file guard (`<outDir>/.watcher.lock`) prevents duplicate watchers in the same directory
- **CLI** — `nestjs-inertia init` (scaffold config + `.gitignore` patch + `nestjs-inertia.d.ts` augmentation stub, idempotent) and `nestjs-inertia codegen [--watch]` powered by `cac`
- **Programmatic API** — `loadConfig`, `generate`, `watch`, `defineConfig`, `ConfigError`, `CodegenError` all exported from package root
