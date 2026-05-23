# Changelog — @dudousxd/nestjs-inertia-vite

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

## 0.9.0-alpha.0 — 2026-05-22

### Added

- **`skipFrameworkPlugin` option** — when `true`, `nestInertia()` returns only the config plugin without auto-loading the framework Vite plugin; useful for ESM-only plugins like `@sveltejs/vite-plugin-svelte` that must be imported directly in the Vite config.

### Changed

- Version bump to `0.9.0-alpha.0` (Inertia v3 monorepo coordination)

## 0.8.0-alpha.0 — 2026-05-22

### Changed

- **`nestInertia()` respects user `root`/`entry` overrides** — the Vite plugin now honours explicit `root` and `entry` options passed by the user rather than always resolving from the package default; removes a common footgun when placing `vite.config.ts` outside the project root
- Version bump to `0.8.0-alpha.0`

## 0.7.0-alpha.0 — 2026-05-22

### Changed

- Bundled with example app, CI workflows, Changesets, MIT LICENSE, and slim docs.

## [0.6.0-alpha.0] - 2026-05-22

### Changed

- Version bump to `0.6.0-alpha.0` (monorepo coordination with Plan D client release; no source changes)

## [0.5.0-alpha.0] - 2026-05-22

### Changed

- Version bump to `0.5.0-alpha.0` (monorepo coordination with codegen release; no source changes)

## [0.1.0-alpha.0] - 2026-05-22

### Added

- `setupInertiaVite(app, opts)` — main.ts helper for dev middleware and prod static serving
- `nestInertia(opts)` Vite plugin with framework flags (react / vue / svelte exactly one)
- Subpath export `@dudousxd/nestjs-inertia-vite/plugin`
