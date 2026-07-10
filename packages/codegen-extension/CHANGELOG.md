# @dudousxd/nestjs-inertia-codegen-extension

## 0.3.0

### Minor Changes

- [#39](https://github.com/DavideCarvalho/nestjs-inertia/pull/39) [`77de1b1`](https://github.com/DavideCarvalho/nestjs-inertia/commit/77de1b162e08176e6a809d434b333db6bff1cb5a) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Add opt-in `shared` and `pageExcludes` options to `nestjsInertiaCodegen()`.

  - `shared: { module, export, kind }` emits `shared.ts` with a typed `InertiaSharedProps`
    re-export, sourced explicitly (no inference) from a named `function` or `type` export —
    useful since shared props are often registered per-request in middleware, not statically
    in `InertiaModule.forRoot()`. Throws with an actionable message if the module or export
    can't be found.
  - `pageExcludes: true` scans the contracts glob for `@Inertia`-decorated, HTTP-method-decorated
    controller methods and emits `page-excludes.ts` — a framework-free `{ path, method }[]` list
    to feed `setGlobalPrefix('api', { exclude })`, replacing a hand-maintained (and
    bug-prone) exclude list. Throws if zero pages are found.

  Calling `nestjsInertiaCodegen()` with no arguments is unchanged — no files are emitted, only
  the existing `apiHeader` (`navigate()` helper) contribution runs.

  Also bumps the `@dudousxd/nestjs-codegen` peer range to `>=0.2.1` (the earliest version
  actually published to npm — `>=0.1.0` never resolved to a real release) and the dev
  dependency to the latest published `0.13.2`.

## 0.2.0

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
