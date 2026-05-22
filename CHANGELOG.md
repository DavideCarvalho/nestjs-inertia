# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `X-Inertia-Partial-Except` header (inverse of Partial-Data filter)
- `X-Inertia-Reset` header (suppresses merge metadata for listed keys)
- Dot-notation top-level prop unpacking (`'user.name' → { user: { name } }`)
- Plain (non-marker) function props auto-invoked and awaited
- `InvalidInertiaConfigException`, `InertiaServiceNotAvailableException`, `UnsupportedRootViewExtensionException` exception classes

### Changed
- `undefined` values in props are converted to `null` on the JSON wire (Laravel parity)
- `Inertia` is now a callable function (decorator) AND retains namespace methods (`Inertia.always(...)`, etc.). No source change for existing markers usage.

### Compatibility
- Public API additions only. The `undefined → null` wire change may affect tests asserting key absence — update those to assert `expect(prop).toBeNull()`.
- 12 of 13 conformance tests previously marked `[A.2]` are now active.

### Pending for 0.3.0 (Plan A.3)
- `forFeature` / multi-app
- Template engines (Handlebars/EJS/Pug/Liquid)
- CSRF integration
- Fastify adapter
