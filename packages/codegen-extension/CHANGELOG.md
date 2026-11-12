# @dudousxd/nestjs-inertia-codegen-extension

## 0.5.0

### Minor Changes

- [#103](https://github.com/DavideCarvalho/nestjs-inertia/pull/103) [`a56d050`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a56d0506d952d05dd45cf5eb8c472181dfdfbecf) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking:** require Node.js 24 or newer (`engines.node` is now `>=24`, was `>=20`; `@dudousxd/nestjs-inertia-cli` declares it for the first time). CI tests on Node 24 and 26.

  Also removed (see the Upgrading page in the docs):

  - `@dudousxd/nestjs-inertia`: `Inertia.lazy()`, the deprecated alias of `Inertia.optional()`. Rename the calls.
  - `@dudousxd/nestjs-inertia`: the `codegen` option of `InertiaModule.forRoot()` (and its `CodegenOptions` type and the `NESTJS_INERTIA_DISABLE_AUTO_CODEGEN` variable). It auto-started the deleted legacy `@dudousxd/nestjs-inertia-codegen` watcher. Delete `codegen: { enabled: false }` from your module; run `nestjs-codegen --watch`, or register `NestjsCodegenModule.forRoot(...)` from `@dudousxd/nestjs-codegen/nest` to watch from the app.
  - `@dudousxd/nestjs-inertia-cli`: `doctor` no longer checks for `codegen: { enabled: false }`, and `init` no longer prints it.

  > Released as **3.0.1**: `2.0.0`, `2.0.1` and `3.0.0` of these packages exist on npm from accidental publishes, so this major (Node 24+) ships one patch past them.

## 0.4.1

### Patch Changes

- [#100](https://github.com/DavideCarvalho/nestjs-inertia/pull/100) [`098bb98`](https://github.com/DavideCarvalho/nestjs-inertia/commit/098bb98c559193267aefe38de9f96fa35e8e487d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. `tsc` builds no longer use a `.tsbuildinfo` that can outlive `dist/` and skip emitting files. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.4.0

### Minor Changes

- [#89](https://github.com/DavideCarvalho/nestjs-inertia/pull/89) [`92eda20`](https://github.com/DavideCarvalho/nestjs-inertia/commit/92eda208910ad42efd81655d6ecb90f8389e7b19) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - `scopes` option: type each `InertiaModule.forFeature({ scope })` app's shared props.

  `nestjsInertiaCodegen({ scopes: { admin: { shared: { module, export, kind } } } })` adds
  `InertiaScopeSharedProps` (scope → its shared-props shape) and `ScopeSharedProps<S>` to
  `shared.ts`, validated like `shared` (errors name `scopes.<scope>.shared`). Works with or
  without the top-level `shared`; `default` is reserved. A test compiles `navigate()` and
  `shared.ts` under `noUnusedLocals`, `noUnusedParameters` and `exactOptionalPropertyTypes`.

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
