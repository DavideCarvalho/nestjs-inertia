# @dudousxd/nestjs-inertia-client

Tuyau-style typed HTTP client for `@dudousxd/nestjs-inertia`, built on TanStack Query v5 core.

## Status

`v0.5.0-alpha.0` — under active development (Plan D).

## Installation

```bash
pnpm add @dudousxd/nestjs-inertia-client @tanstack/query-core zod
```

## Overview

This package ships:

- **`createFetcher`** — a thin `fetch` wrapper that handles JSON bodies, path param interpolation, query strings, and maps 4xx/5xx responses to `ApiHttpError`.
- **`Contract` builders** — define typed REST contracts (Zod-backed query/body/response schemas) consumed by codegen.
- **`@ApplyContract`** — NestJS method decorator that binds a contract to a controller handler.
- **SSR helpers** — `hydrateClientFromInertia` and `seedInitialQueries` for TanStack Query SSR hydration via Inertia shared props.
- **`invalidate`** — convenience wrapper around `queryClient.invalidateQueries`.

The generated `api.ts` (emitted by `@dudousxd/nestjs-inertia-codegen`) imports from this package.

## See Also

- Spec: `/docs/superpowers/specs/2026-05-22-nestjs-inertia-plan-d-design.md`
- Plan: `/docs/superpowers/plans/2026-05-22-nestjs-inertia-plan-d-client.md`
