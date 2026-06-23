# Changelog — @dudousxd/nestjs-inertia-client

## 2.3.0

### Minor Changes

- [`e33d6a0`](https://github.com/DavideCarvalho/nestjs-inertia/commit/e33d6a0a96a5c7e3edffa30474cd57246207a894) - Add opt-in superjson runtime integration — the runtime complement to the codegen `serialization: 'superjson'` option (which already emits rich types, e.g. `Date` stays `Date`).

  `superjson` is an **optional** peer dependency: all superjson imports are isolated behind a dedicated `@dudousxd/nestjs-inertia-client/superjson` subpath, so plain-JSON consumers never load it.

  - **Fetcher `deserialize` hook** — `FetcherOptions` gains a serialization-agnostic `deserialize?: (raw: unknown) => unknown`, applied to the parsed body of `application/json` responses only (not the text fallback or SSE). Default is identity, so existing consumers are unaffected.
  - **`/superjson` subpath** exports `superjsonFetcherOptions()` (and a `withSuperjson(opts)` merger) that supply `superjson.deserialize` plus the `x-superjson: 1` opt-in request header — `createFetcher({ baseUrl, ...superjsonFetcherOptions() })`.
  - **`SuperjsonInterceptor`** (NestJS `NestInterceptor`) maps responses through `superjson.serialize(...)` (the `{ json, meta }` envelope) **only** when the request carries `x-superjson: 1`; otherwise it passes the response through untouched.

  Content-negotiated via the `x-superjson` header so each consumer (flip-frontend, the codegen client, etc.) can adopt superjson independently with no atomic cross-app flip — superjson never breaks a plain-JSON consumer.

## 2.2.0

### Minor Changes

- [`9606527`](https://github.com/DavideCarvalho/nestjs-inertia/commit/9606527b3944cc623da5bfc1b126428845af938c) - Serialize generated response types with `Jsonify<T>` by default.

  Over JSON the wire shape of a response differs from the controller's return type — most notably `Date` becomes an ISO `string`, and any `toJSON()` holder collapses to its returned shape. The codegen previously emitted `response` as the raw `Awaited<ReturnType<Controller['method']>>`, so clients were typed against values they never actually receive.

  The client package now exports a type-only `Jsonify<T>` that models the result of `JSON.parse(JSON.stringify(value))`: `Date` → `string`, any `toJSON(): R` → `Jsonify<R>`, arrays/tuples recurse element-wise, plain objects recurse per-property (dropping function/symbol/`undefined`-only values while keeping optional properties optional), `Map`/`Set` → `{}`, and primitives/`unknown`/`any` pass through.

  The codegen now wraps every emitted `response` type in `Jsonify<...>` by default and adds `import type { Jsonify } from '@dudousxd/nestjs-inertia-client';` to the generated `api.ts`. A new `serialization?: 'json' | 'superjson'` config option (default `'json'`) opts out: set `serialization: 'superjson'` to emit the raw controller return type unchanged for clients that revive payloads (Dates/Maps/Sets) with superjson.

## 2.1.1

### Patch Changes

- [`ee4f88e`](https://github.com/DavideCarvalho/nestjs-inertia/commit/ee4f88ebb50183a1633056b81c275e1adf3159a6) - feat: `createFetcher` now implements `sse()` to satisfy the codegen `Fetcher` contract (SSE/@Sse() endpoints), fixing `createApi(fetcher)` typecheck against generated Inertia APIs.

## 2.1.0

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

## 2.0.0

### Major Changes

- [`1cd3d1b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/1cd3d1bf25e3c98db9cfb0ed55e9057e20d3d97f) - Remove the `useInertiaForm` hook and the `./react-form` subpath export (plus the
  `react-hook-form` / `@hookform/resolvers` optional peers and the `mergeServerErrors`
  helper). The codegen zod-schema generation and the server-side validation filter
  are unaffected. Forms should be wired with your own react-hook-form + submission
  lane, using the generated zod schemas.

## 1.8.0

### Minor Changes

- [`0741785`](https://github.com/DavideCarvalho/nestjs-inertia/commit/074178563ae98e7af2b7159bcaa09523143b2df7) - Add the `useInertiaForm` React hook on a new `./react-form` subpath. One call
  wraps react-hook-form + `zodResolver(schema)` + an Inertia `router` submit, with
  automatic server-error merge into RHF state (scoped by `errorBag`), `formError`
  aggregation for non-field/`_` keys, `isSubmitting`, and `resetOnSuccess`.
  `react-hook-form` and `@hookform/resolvers` are optional peers reachable only
  through `./react-form` — base `./` and `./react` bundles never pull them. Ships a
  framework-free `mergeServerErrors` helper (shared seam for Vue/Svelte recipes).

## 1.7.5

### Patch Changes

- Updated dependencies [[`118b9ea`](https://github.com/DavideCarvalho/nestjs-inertia/commit/118b9ea56da709784dd6608a62f06caf4115f9bd)]:
  - @dudousxd/nestjs-inertia@1.4.5

## 1.7.4

### Patch Changes

- Updated dependencies [[`5c62550`](https://github.com/DavideCarvalho/nestjs-inertia/commit/5c6255070fe8dcb246a7f79c81f6a23f0395c68b)]:
  - @dudousxd/nestjs-inertia@1.4.4

## 1.7.3

### Patch Changes

- Mark `./server` subpath export with `"node"` condition so Vite's dep optimizer skips server-only code. Eliminates the need for `optimizeDeps.exclude` in consumer projects.

## 1.7.2

### Patch Changes

- Add `headers` prop to `InertiaRouteProvider` and `setGlobalHeaders` for auth header injection. The fetcher now reads global headers on every request, enabling Bearer token injection from Keycloak, Auth0, or any auth provider without custom fetch wrappers.

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
