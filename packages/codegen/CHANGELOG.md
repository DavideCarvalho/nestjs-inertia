# Changelog — @dudousxd/nestjs-inertia-codegen

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
