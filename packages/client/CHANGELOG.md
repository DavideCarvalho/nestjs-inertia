# Changelog — @dudousxd/nestjs-inertia-client

For the full repository changelog see [`../../CHANGELOG.md`](../../CHANGELOG.md).

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
