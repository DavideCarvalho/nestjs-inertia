# Changelog — @dudousxd/nestjs-inertia

## 1.7.1

### Patch Changes

- [`d40e23e`](https://github.com/DavideCarvalho/nestjs-inertia/commit/d40e23ed3860d8499d9042bef836cabc26232a84) - Fix: nested `once()` markers now mirror top-level `once()` semantics — they re-resolve only on a full reload or when their key is explicitly reset (was incorrectly gated on `subKeep === null`).

  Internal refactors (behavior-preserving): share the method-spoof rule across Express and Fastify, collapse the handlebars/ejs/pug/liquid template-engine adapters into one `createTemplateEngineAdapter` factory, route the validation filter through the request adapter (inject `HttpAdapterHost`, drop the bespoke `sendRedirect`), and extract `zodAstToTs` + route-name helpers out of `contracts-fast`.

## 1.7.0

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

## 1.6.1

### Patch Changes

- [`a02f880`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a02f880c4ec9399e6e4ca9f4f6477dd6397ee4e2) - perf: avoid redundant prop-tree work per render — identity fast-path in `unpackDotKeys` when no dot-keys are present, `nullifyUndefined` returns existing references when no `undefined` is found (no full deep clone), and header splits are guarded behind presence to avoid array allocation on the common path.

## 1.6.0

### Minor Changes

- [#24](https://github.com/DavideCarvalho/nestjs-inertia/pull/24) [`888fd30`](https://github.com/DavideCarvalho/nestjs-inertia/commit/888fd3020ff3762571d79834569e1046e760052c) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Emit render diagnostics on the standard `aviary:inertia:render` channel via
  `@dudousxd/nestjs-diagnostics` (`emit('inertia', 'render', payload)`), instead of
  the bespoke `nestjs-inertia:render` channel. The diagnostic payload shape
  (`InertiaRenderDiagnostic`, `v: 1`) is unchanged — it now travels inside the
  standard envelope (`{ ts, lib, event, traceId?, payload }`), with `traceId`
  auto-filled from the optional `@dudousxd/nestjs-context` accessor when present.
  The render path stays zero-cost when no watcher subscribes.

  Any subscriber should now subscribe to `aviary:inertia:render` and read
  `envelope.payload`. The generic `@dudousxd/nestjs-diagnostics-telescope` watcher
  captures these automatically.

  BREAKING (pre-2.0 of this line): the `INERTIA_DIAG_CHANNEL` constant is removed
  (the channel name is now derived via `@dudousxd/nestjs-diagnostics`'
  `channelName('inertia', 'render')`). The dedicated
  `@dudousxd/nestjs-telescope-inertia-watcher` package is retired in favor of the
  generic diagnostics watcher.

## 1.5.0

### Minor Changes

- [`4395608`](https://github.com/DavideCarvalho/nestjs-inertia/commit/439560897a20f84068f94d4402fc196b92367624) - Emit per-render diagnostics on a `node:diagnostics_channel` (`nestjs-inertia:render`)
  for tooling such as nestjs-telescope's Inertia panel: rendered component, resolved
  props (passed by reference for downstream redaction), the partial-reload decision,
  deferred/optional/once/merge/excluded keys, asset version + version-mismatch, history
  flags, status code and payload size. Zero-cost when nothing is subscribed; gated by a
  `diagnostics` module option. No new runtime dependency (`node:diagnostics_channel` is
  core). Also routes non-attributable flat class-validator messages to the form-level
  error bucket instead of inventing a phantom field key.

- [`38eac5a`](https://github.com/DavideCarvalho/nestjs-inertia/commit/38eac5ab639cd446593ccb29f5fb6a4e83774b45) - Add `InertiaValidationFilter`: opt-in (`validation: { enabled: true }`) automatic
  validation-error handling that flashes a field-keyed error bag and 303-redirects
  back on Inertia non-GET requests. Ships `inertiaValidationExceptionFactory`
  (blessed `ValidationPipe` factory), `flattenValidationErrors`, and
  `extractFieldErrors` (recognizes the factory payload, `ContractValidationPipe`
  issues, raw `ZodError`, and flat class-validator `message: string[]`). Cross-runtime
  (Express + Fastify) via shared `getHeader`. Also fixes `ErrorBagInterceptor` to use
  the cross-runtime header read so Fastify error-bag scoping works.

## 1.4.5

### Patch Changes

- [`118b9ea`](https://github.com/DavideCarvalho/nestjs-inertia/commit/118b9ea56da709784dd6608a62f06caf4115f9bd) - Log a "Codegen auto-watch will start after application bootstrap" hint during module init in dev mode. The auto-watch only starts in `onApplicationBootstrap`, so a boot that stalls mid-init previously produced no codegen output with zero trace of why; the early hint makes a stalled boot diagnosable from the log. Also documents the symptom in the README troubleshooting section.

## 1.4.4

### Patch Changes

- [`5c62550`](https://github.com/DavideCarvalho/nestjs-inertia/commit/5c6255070fe8dcb246a7f79c81f6a23f0395c68b) - Fix `suppressPostSendWrites` swallowing `res.end()` on streaming responses.

  `end` was gated on `res.headersSent`, but streaming handlers (SSE, NDJSON,
  file downloads) flush headers first, stream the body, and only then call
  `end()` — which the wrapper silently dropped. The chunked terminator was
  never written, so the connection hung until the client/proxy idle timeout
  (behind an AWS ALB this surfaces in the browser as
  `ERR_HTTP2_PROTOCOL_ERROR`). `end` is now gated on `res.writableEnded`
  (the condition that actually means "already sent" for `end`), while
  `status`/`json`/`send`/`header`/`setHeader` keep the `headersSent` guard.

## 1.4.2

### Patch Changes

- [`995cc13`](https://github.com/DavideCarvalho/nestjs-inertia/commit/995cc131b00bcf8aa45d36fc66b9cf9453125efa) - Remove alpha status from README. Add InertiaSharedProps and PageProps exports to core.

## 1.4.1

## 2.0.0

### Minor Changes

- feat: type-safe @Inertia, Props E2E, infiniteQueryOptions, URL params, doctor CLI, codegen HMR

## 2.0.0

### Patch Changes

- feat(codegen): ReturnType<import(...)> for response types, queryKey helper, TanStack helpers, type ref imports, path alias resolution, debug mode

## 3.0.0

### Patch Changes

- feat(codegen): import type references from source instead of inline expansion — eliminates unknown fields from depth limits

## 2.0.1

### Patch Changes

- fix(codegen): remove @tanstack/query-core dependency — generated api.ts uses plain object literals

## 2.0.0

### Patch Changes

- feat(codegen): add queryKey() helper for typed cache invalidation — api.crew.getCrew.queryKey()

## 1.0.7

### Patch Changes

- fix(core): use data-page="app" attribute on script tag for Inertia v3 protocol compatibility

## 1.0.6

### Patch Changes

- fix(codegen): resolve interfaces, type aliases, and enums — not just classes. Conditional @tanstack/query-core import.

## 1.0.5

### Patch Changes

- fix(codegen): consistent camelCase route names for all routes (not just @ApplyContract)

## 1.0.4

### Patch Changes

- fix(codegen): resolve DTOs imported from separate files — cross-file class resolution via ts-morph import following

## 1.0.3

### Patch Changes

- [`c79cc6d`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c79cc6dad64342bce17c28a705ae27911c3f4c74) - Fix React Refresh preamble in @vite directive, watcher initial pass runs full discovery, auto-sync VERSION constants

## 1.0.2

### Patch Changes

- [`27e0bab`](https://github.com/DavideCarvalho/nestjs-inertia/commit/27e0bab4b7f8752a4dd179cc715b4e3d64161624) - Fix: @vite directive includes React Refresh preamble, watcher initial pass runs full route+contract discovery from DTOs

## 1.0.1

### Patch Changes

- [`a33c81b`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a33c81b0a53077559b1f9433824cfaee1b01c80c) - Fix: @vite directive includes React Refresh preamble in dev, watcher initial pass runs full route+contract discovery

## 1.0.0

### Minor Changes

- [`c5878e3`](https://github.com/DavideCarvalho/nestjs-inertia/commit/c5878e3f8827d9e89710df0154ea76996b6db62a) - First public release — Inertia.js v3 adapter for NestJS.

  - Core: InertiaModule.forRoot/forRootAsync/forFeature, @Inertia decorator, Inertia.optional/defer/merge/always markers, CSRF with tokenContext, SSR support, Express + Fastify adapters
  - Vite: setupInertiaVite + nestInertia plugin, @inertia/@vite/@inertiaHead shell directives
  - Codegen: nestjs-inertia init (full scaffold + auto-patch), auto-watch in dev, static AST discovery, class-validator DTO support, Route/Path type helpers, @As hierarchical naming
  - Client: defineContract + @ApplyContract, typed Link for React/Vue/Svelte with context providers, createFetcher, SSR hydration, rich error messages
  - Testing: expectInertia matchers, assertInertia, InertiaTestingModule, fakes

For the full repository changelog see [`../../CHANGELOG.md`](../../CHANGELOG.md).

## 0.9.0-alpha.0 — 2026-05-22

### BREAKING CHANGE — Removed unimplemented CodegenOptions fields

`CodegenOptions.configFile` and `CodegenOptions.debounceMs` have been removed.
Both fields were declared in the public type but were never read by the implementation —
setting them had no effect. They were never functional, so this removal is strictly
a type cleanup. If you referenced these fields in your code, simply remove them.

### BREAKING CHANGE — Inertia v3 protocol

Four changes to align with the Inertia.js v3 wire protocol:

1. **Shell HTML format** — `@inertia` directive now emits `<div id="app"></div><script id="inertia-page" type="application/json">…</script>` instead of `<div id="app" data-page="…">`. Clients must be on Inertia v3+.
2. **`clearHistory` / `encryptHistory` omitted when falsy** — these page-level properties are no longer sent on the wire when their value is `false`/`undefined`, matching the v3 spec.
3. **`Inertia.lazy()` deprecated** — renamed to `Inertia.optional()`; the `lazy` alias is kept for backwards compatibility and logs a deprecation warning at runtime.
4. **Nested partial-reload dot-notation** — `only`/`except` arrays now support dot-notation paths (e.g. `"user.profile"`) to target nested props.

### Changed

- Version bump to `0.9.0-alpha.0`

## 0.8.0-alpha.0 — 2026-05-22

### Added

- **Auto-bootstrap codegen** — `InertiaModule` implements `OnApplicationBootstrap`; codegen is triggered automatically at app startup when `autoCodegen` is enabled in the module options
- **`RegistryRoutes` helper** — new export enabling module augmentation for typed route names and params; consumers import `RegistryRoutes` to get the full typed route map from the augmented `InertiaRegistry`
- **Probe loop fix** — `NESTJS_INERTIA_CODEGEN_PROBE` env guard prevents `OnApplicationBootstrap` from re-triggering codegen when the app is bootstrapped by the codegen probe itself

### Changed

- Version bump to `0.8.0-alpha.0`

## 0.7.0-alpha.0 — 2026-05-22

### Changed

- Bundled with example app, CI workflows, Changesets, MIT LICENSE, and slim docs.

## [0.6.0-alpha.0] - 2026-05-22

### Changed

- Version bump to `0.6.0-alpha.0` (monorepo coordination with Plan D client release; no source changes)

## [0.5.0-alpha.0] - 2026-05-22

### Added

- `InertiaRegistry` interface — empty extensible interface for codegen-driven module augmentation. Augment it in your project to get typed page names and route params.

### Changed

- Version bump to `0.5.0-alpha.0` (monorepo coordination with codegen release)

## [0.4.0-alpha.0] - 2026-05-22

### Added (companion packages)

- `@dudousxd/nestjs-inertia-vite@0.1.0-alpha.0` — Vite dev/build helpers + plugin (`nestInertia({ ssr, react|vue|svelte, ... })`)
- `@dudousxd/nestjs-inertia-testing@0.1.0-alpha.0` — `expectInertia(res)` fluent matchers + `assertInertia(payload)` + `createFakeInertiaRequest/Response` + `InertiaTestingModule.forTest()` + Jest/Vitest `expect.extend` integration

### Changed

- `@dudousxd/nestjs-inertia` core bumped to `0.4.0-alpha.0` (monorepo coordination; no source changes)

## [0.3.0-alpha.0] - 2026-05-22

### Added

- `InertiaModule.forFeature({ scope })` and `forFeatureAsync` — multi-app support
- `@UseInertia('scope')` decorator (class + method level) for selecting scope
- `InertiaScopeSwitcherInterceptor` — auto-installed; replaces `req.inertia` with scoped service
- 4 template engine adapters: Handlebars, EJS, Pug, LiquidJS (peer deps, all optional)
- `MissingTemplateEngineDepException` with installation hint
- CSRF: `CsrfCookieInterceptor` (writes XSRF-TOKEN cookie) + `CsrfGuard` (validates X-XSRF-TOKEN header)
- `generateCsrfToken` / `verifyCsrfToken` HMAC-SHA256 helpers
- `MissingCookieDepException` + `InvalidCsrfTokenException` (extends `ForbiddenException` → 403)
- Fastify adapter — full parity with Express: `fastifyAdapter`, `registerFastifyInertia` (decorateRequest + onRequest), `registerFastifyMethodSpoof` (preHandler)
- Platform detection in `InertiaModule.onApplicationBootstrap` via `HttpAdapterHost.httpAdapter.getType()`
- `InertiaAuthGuard` is now platform-aware (Express `redirect(status, url)` vs Fastify `redirect(url, status)`)
- `RedirectInterceptor` patches `reply.code()` on Fastify for `@Res()` handlers that send manually

### Pending for future plans

- Companion packages: `@dudousxd/nestjs-inertia-vite` (Plan B), `-testing` (Plan B), `-codegen` (Plan C), `-client` (Plan D — Tuyau-style)
- Examples + docs site + CI workflows (Plan E)

## [0.2.0-alpha.0] - 2026-05-22

### Added

- `InertiaModule.forRootAsync()` with `useFactory + inject`, `useClass`, `useExisting` paths
- `@Inertia('Page')` decorator + `InertiaRenderInterceptor` (coexists with imperative `req.inertia.render()`)
- `Inertia.once()` prop marker (resolves once per session, refreshed via `X-Inertia-Reset-Once`)
- `RedirectInterceptor` — auto 302→303 for PUT/PATCH/DELETE Inertia requests
- `MethodSpoofMiddleware` — `_method=PUT/PATCH/DELETE` override on POST + multipart
- Shell HTML directives in file-based `rootView`: `@inertia`, `@inertiaHead`, `@vite('entry')`, `@viteRefresh`, `@asset('path')`
- Real SSR loader (dynamic `import(pathToFileURL)`, cache, `throwOnError`)
- `InertiaAuthGuard` (409 vs 302 based on X-Inertia header, return_to preserved)
- `InertiaNotFoundFilter` (JSON for `/api/*`, Inertia 'NotFound' page elsewhere)
- `ErrorBagInterceptor` (`X-Inertia-Error-Bag` namespaces props.errors)
- `FlashStore` interface (pluggable session-errors source, default no-op)
- `X-Inertia-Partial-Except` header
- `X-Inertia-Reset` header
- Dot-notation top-level prop unpacking
- Plain (non-marker) function props auto-invoked and awaited

### Changed

- `undefined` values in props converted to `null` on the JSON wire (Laravel parity)
- `Inertia` is now a callable function (decorator) AND retains namespace methods

### Pending for 0.3.0 (Plan A.3)

- `forFeature` / multi-app, template engines, CSRF, Fastify adapter

## [0.1.0-alpha.0] - 2026-05-22

### Added

- Initial release with core Express Inertia v2 protocol, partial reloads, prop markers, SSR stub, manifest/asset version providers, suppressPostSendWrites helper
