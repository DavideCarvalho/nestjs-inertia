# Changelog — @dudousxd/nestjs-inertia-vite

## 1.5.1

### Patch Changes

- [#37](https://github.com/DavideCarvalho/nestjs-inertia/pull/37) [`605c1f7`](https://github.com/DavideCarvalho/nestjs-inertia/commit/605c1f78189664556001e3504614cebd9327e107) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Ship TanStack Intent agent skills (SKILL.md) inside the package.

## 1.5.0

### Minor Changes

- [#29](https://github.com/DavideCarvalho/nestjs-inertia/pull/29) [`7def22b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/7def22b2df24a472f0e0bcef457aa3b1e60f9fe9) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - A broad set of ecosystem improvements across the server adapter, typed client, codegen, testing, and Vite packages.

  **Server (`@dudousxd/nestjs-inertia`)**

  - General flash messages: the flash store now carries arbitrary flash payloads (success, info, warning, etc.) instead of being limited to errors.
  - Stable asset-version fallback: the asset-version provider derives a deterministic fallback version so SSR/CSR markup stays consistent when no explicit version is configured.
  - `matchOn: string | string[]`: partial-reload / scope matching accepts either a single key or an array of keys.
  - `lazy()` deprecation: deprecated usages now emit a warning through the Nest `Logger` to guide migration.
  - SSR streaming: streaming SSR render is supported on both the Express and Fastify adapters, with a retryable SSR loader that falls back to buffered SSR when streaming setup fails.
  - Packaging hygiene: dual ESM/CJS `exports` maps and build config cleaned up across the package set.

  **Client (`@dudousxd/nestjs-inertia-client`)**

  - Typed `useForm` end-to-end for React, Vue, and Svelte.
  - Typed `<Deferred>` / `<WhenVisible>` components with shared deferred types across frameworks.
  - Native `router.poll` and prefetch helpers (typed poll + prefetch-route utilities).

  **Codegen, testing, and Vite**

  - Codegen extension, testing helpers (Jest + Vitest), and the Vite plugin updated to support the new typed client surface and packaging conventions.

## 1.4.3

### Patch Changes

- [`22ece7b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/22ece7bbda97a4db5302677c19314e8663e07e50) - Fix: externalize express, body-parser, and Node built-ins from bundle to prevent "Dynamic require of path is not supported" crash on Node 26.

## 1.4.2

### Patch Changes

- [`995cc13`](https://github.com/DavideCarvalho/nestjs-inertia/commit/995cc131b00bcf8aa45d36fc66b9cf9453125efa) - Remove alpha status from README. Add InertiaSharedProps and PageProps exports to core.

- Updated dependencies [[`995cc13`](https://github.com/DavideCarvalho/nestjs-inertia/commit/995cc131b00bcf8aa45d36fc66b9cf9453125efa)]:
  - @dudousxd/nestjs-inertia@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@1.4.1

## 2.0.0

### Minor Changes

- feat: type-safe @Inertia, Props E2E, infiniteQueryOptions, URL params, doctor CLI, codegen HMR

### Patch Changes

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.0

## 2.0.0

### Patch Changes

- feat(codegen): ReturnType<import(...)> for response types, queryKey helper, TanStack helpers, type ref imports, path alias resolution, debug mode

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.0

## 3.0.0

### Patch Changes

- feat(codegen): import type references from source instead of inline expansion — eliminates unknown fields from depth limits

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@3.0.0

## 2.0.1

### Patch Changes

- fix(codegen): remove @tanstack/query-core dependency — generated api.ts uses plain object literals

- Updated dependencies []:
  - @dudousxd/nestjs-inertia@2.0.1

## 2.0.0

### Patch Changes

- feat(codegen): add queryKey() helper for typed cache invalidation — api.crew.getCrew.queryKey()

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
