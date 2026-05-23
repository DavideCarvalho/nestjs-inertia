# Changelog — @dudousxd/nestjs-inertia-client

## 1.0.3

### Patch Changes

- Updated dependencies [[`c79cc6d`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c79cc6dad64342bce17c28a705ae27911c3f4c74)]:
  - @dudousxd/nestjs-inertia@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [[`27e0bab`](https://github.com/DavideCarvalho/nestjs-inertia/commit/27e0bab4b7f8752a4dd179cc715b4e3d64161624)]:
  - @dudousxd/nestjs-inertia@1.0.2

## 1.0.1

### Patch Changes

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

For the full repository changelog see [`../../CHANGELOG.md`](../../CHANGELOG.md).

## 0.9.0-alpha.0 — 2026-05-22

### Changed

- Broadened peer deps: `@inertiajs/react ^2||^3`, `@inertiajs/vue3 ^2||^3`, `react ^18||^19`
- Svelte `Link` component migrated to Svelte 5 Runes API (`$props` / `$derived` / children snippet)
- `Link.svelte` is now copied to `dist/svelte/` as part of the build
- Version bump to `0.9.0-alpha.0` (Inertia v3 monorepo coordination)

## 0.8.0-alpha.0 — 2026-05-22

### Added

- **Typed `<Link>` for React** (`/react` subpath) — `<Link route="..." routeParams={{...}}>` with full TypeScript autocompletion; `routeParams` is omitted when the route has no dynamic segments
- **Typed `<Link>` for Vue 3** (`/vue` subpath) — same typed API via a Vue 3 component; wraps `@inertiajs/vue3`'s `Link`
- **Typed `<Link>` for Svelte** (`/svelte` subpath) — same typed API as a Svelte 5 component; wraps `@inertiajs/svelte`'s `Link`
- **`setRouteResolver(fn)`** — boot-time helper to wire the codegen-emitted `route()` function into all typed `Link` components; call once in your entry file
- **`RegistryRoutes` consumption** — `Link` components read typed route names and params from the `InertiaRegistry` augmentation emitted by codegen `init`

### Changed

- Version bump to `0.8.0-alpha.0`

## 0.7.0-alpha.0 — 2026-05-22

### Changed

- Bundled with example app, CI workflows, Changesets, MIT LICENSE, and slim docs.

## [0.6.0-alpha.0] - 2026-05-22

### Added

- **Initial release** of `@dudousxd/nestjs-inertia-client`
- **`Contract` builders** — `Contract.get`, `.post`, `.put`, `.patch`, `.delete`; each accepts a URL path and a definition with optional `query` / `body` and required `response` Zod schemas, returning a typed `ContractDef`
- **`@ApplyContract(contractDef)`** — NestJS method decorator that stores the contract under `CONTRACT_METADATA` (`Reflect` metadata) on the handler; enables codegen contract discovery and `api.ts` emission
- **`CONTRACT_METADATA` symbol** + **`getContract(target, key)`** helper for reading contract metadata
- **`createFetcher(opts?): Fetcher`** — thin `fetch` wrapper
  - `buildUrl` path-param interpolation (`:param` → value) + `URLSearchParams` query-string serialization
  - JSON body encoding (`Content-Type: application/json`) and `FormData` passthrough (no `Content-Type` override)
  - `Accept: application/json` default header
  - `ApiHttpError` thrown on non-2xx responses, with static `fromResponse(res)` async factory
  - `onError` hook called before re-throwing
  - Pluggable `fetch` implementation via `opts.fetch` (useful in tests and SSR)
  - HTTP 204 → returns `undefined`
- **`ApiHttpError`** — error class with `.status: number`, `.body: unknown`, and `.response: Response`
- **`invalidate(queryClient, queryKey)`** — convenience wrapper around `queryClient.invalidateQueries`
- **SSR hydration** (`./ssr` subpath export)
  - `hydrateClientFromInertia(page)` — creates a `QueryClient` pre-seeded from `page.props._initialQueries`
  - `seedInitialQueries(qc)` — serialises the full `QueryClient` cache into the `_initialQueries` array for Inertia shared props
- **Full Vitest test suite** — 47 tests covering all exports
