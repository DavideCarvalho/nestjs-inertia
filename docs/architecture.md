# Architecture

nestjs-inertia is a TypeScript-first monorepo of five focused packages that together implement the [Inertia.js](https://inertiajs.com/) protocol for NestJS applications.

## Package map

```
                        ┌──────────────────────────────┐
                        │   @dudousxd/nestjs-inertia   │
                        │          (core)               │
                        │                               │
                        │  InertiaModule.forRoot()      │
                        │  @Inertia() decorator         │
                        │  InertiaService               │
                        │  version negotiation          │
                        └───────────┬──────────────────┘
               ┌───────────────────┤────────────────────┐
               │                   │                    │
               ▼                   ▼                    ▼
  ┌────────────────────┐  ┌─────────────────┐  ┌───────────────────────┐
  │  nestjs-inertia-   │  │  nestjs-inertia │  │  nestjs-inertia-      │
  │       vite         │  │    -testing     │  │      codegen          │
  │                    │  │                 │  │                       │
  │  Vite plugin       │  │ expectInertia() │  │  CLI: codegen         │
  │  dev-server HMR    │  │ InertiaFaker    │  │  Emits:               │
  │  manifest serving  │  │ TestingModule   │  │    pages.d.ts         │
  └────────────────────┘  └─────────────────┘  │    routes.ts          │
                                               │    api.ts             │
                                               └──────────┬────────────┘
                                                          │ emits
                                                          ▼
                                               ┌───────────────────────┐
                                               │  nestjs-inertia-      │
                                               │       client          │
                                               │                       │
                                               │  Contract builder     │
                                               │  @ApplyContract       │
                                               │  createFetcher        │
                                               │  SSR hydration        │
                                               └───────────────────────┘
```

## Package responsibilities

### `@dudousxd/nestjs-inertia` (core)

The heart of the system. Registers the Inertia protocol as a NestJS module:

- `InertiaModule.forRoot(options)` — registers the module globally, configures the root view path, version string, and shared-data factory.
- `@Inertia(component)` — method decorator that intercepts a controller return value and serializes it as an Inertia response (JSON with `X-Inertia` headers, or HTML on first visit).
- `InertiaService` — injectable service for programmatic Inertia redirects and shared-prop merging.
- Version negotiation — compares the client-sent `X-Inertia-Version` header and triggers a full reload when the asset version changes.

### `@dudousxd/nestjs-inertia-vite`

Bridges NestJS and Vite's dev server:

- Vite plugin (`nestInertia(options)`) that configures React (or Vue/Svelte) transforms.
- `setupInertiaVite(app, options)` — attaches the Vite dev-server middleware to the NestJS Express/Fastify app so that HMR and the HTML shell are served correctly in development.
- In production, reads the Vite manifest to resolve hashed asset URLs and inject them into the root view.

### `@dudousxd/nestjs-inertia-testing`

Drop-in test utilities:

- `expectInertia(response)` — fluent assertion chain (`toHaveComponent`, `toHaveProps`, `toHaveVersion`, …).
- `InertiaFaker` — creates fake Inertia responses for unit tests without spinning up HTTP.
- `createInertiaTestingModule(metadata)` — thin wrapper around NestJS `Test.createTestingModule` that pre-registers `InertiaModule`.

### `@dudousxd/nestjs-inertia-codegen`

CLI (`nestjs-inertia codegen`) that statically analyses the NestJS app and emits TypeScript:

- `pages.d.ts` — union of all Inertia page component names known to the app.
- `routes.ts` — typed route helpers derived from controller metadata.
- `api.ts` — typed client API surface derived from `@ApplyContract` metadata (feeds `nestjs-inertia-client`).

Configuration lives in `nestjs-inertia.config.ts` at the project root.

### `@dudousxd/nestjs-inertia-client`

Tuyau-style typed HTTP client:

- `Contract` builder — declare typed request/response schemas with Zod.
- `@ApplyContract(contract)` — decorator that attaches the contract to a controller method (read by codegen).
- `createFetcher(apiDef)` — creates a typed fetch client from the generated `api.ts`.
- SSR hydration helpers — `hydrateClientFromInertia` — initialises TanStack Query from the Inertia initial-page payload on the client side.

## Data flow (request lifecycle)

```
Browser GET /dashboard
  → NestJS router → DashboardController.index()
      → @Inertia('Dashboard') interceptor
          ← { user, count }   (return value)
      → InertiaService serializes response
          • First visit  → HTML shell (Vite manifest + <div id="app" data-page="…">)
          • X-Inertia    → JSON { component, props, url, version }
  → Browser renders React page via inertia/app.tsx
```
