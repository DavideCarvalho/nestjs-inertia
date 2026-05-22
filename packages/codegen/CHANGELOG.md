# Changelog — @dudousxd/nestjs-inertia-codegen

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
