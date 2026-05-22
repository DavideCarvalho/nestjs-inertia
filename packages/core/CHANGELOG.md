# Changelog — @dudousxd/nestjs-inertia

For the full repository changelog see [`../../CHANGELOG.md`](../../CHANGELOG.md).

## 0.9.0-alpha.0 — 2026-05-22

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
