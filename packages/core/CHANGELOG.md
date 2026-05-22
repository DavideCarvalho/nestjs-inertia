# Changelog — @dudousxd/nestjs-inertia

For the full repository changelog see [`../../CHANGELOG.md`](../../CHANGELOG.md).

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
