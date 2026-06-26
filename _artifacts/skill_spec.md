# Skill spec — nestjs-inertia (autonomous pass)

One domain map, three primary client-facing packages, six flat `core`-type skills.
No router skill (each package holds <5 skills; flat structure). Every snippet is
grounded in this repo's source or package READMEs.

## Scope decision

Covered (packages a consumer actually imports):

- `@dudousxd/nestjs-inertia` (packages/core) — the NestJS module + service + decorators + markers.
- `@dudousxd/nestjs-inertia-client` (packages/client) — typed contracts/fetcher + typed Link/forms.
- `@dudousxd/nestjs-inertia-vite` (packages/vite) — dev/build Vite glue.

Deliberately uncovered (listed in domain_map gaps):

- `@dudousxd/nestjs-inertia-testing` — test-only matchers, narrow surface.
- `@dudousxd/nestjs-inertia-codegen-extension` — thin nestjs-codegen extension depending on an external package.

## Skills

| Skill | Package | Why it exists (AI-agent failure mode it prevents) |
|---|---|---|
| inertia-module-setup | core | Agents wire the wrong DI shape, forget rootView directives, or mix @Inertia decorator + manual render. |
| inertia-prop-markers | core | Agents call marker fns eagerly, mis-handle partial reloads, or expect deferred props on the first response. |
| inertia-forms-validation | core | Agents enable validation without a flashStore (boot crash), or expect errors without a session-backed store. |
| inertia-typed-client | client | Agents hand-write fetch calls / forget @ApplyContract({ validate: true }) / misread the generated api.ts surface. |
| inertia-typed-link | client | Agents forget <InertiaRouteProvider>, pass href to the typed Link, or skip routeParams. |
| inertia-vite-setup | vite | Agents pass multiple framework flags, forget middleware-mode, or mis-order the dev/prod branch. |

## Grounding sources

- packages/core/src/{module,service,markers,types}.ts, decorator/*, flash/flash-store.ts, validation/*, README.md
- packages/client/src/{index,server/index}.ts, contract/*, fetcher/fetcher.ts, react/{index,provider,link,use-typed-form}.tsx, README.md
- packages/vite/src/{setup,plugin/plugin}.ts, index.ts
- docs/forms.md

## Remaining gaps (what a maintainer interview would have answered)

1. Severity ranking of the documented failure modes — inferred, not confirmed.
2. GitHub issue mining was not performed (no verified gh access); additional real-world pitfalls may exist.
3. README references InertiaAuthGuard / InertiaNotFoundFilter that are NOT exported by the core package — excluded from skills as unshipped; a maintainer should confirm whether these are planned or stale docs.
4. Generated codegen artifacts (api.ts / routes.ts / forms.ts) are produced downstream by the external @dudousxd/nestjs-codegen pipeline; their exact emitted symbol names are taken from READMEs/JSDoc rather than a checked-in fixture.
5. examples/* are empty in this checkout; no end-to-end app was available to validate the snippets at runtime.
6. Intended production defaults (SSR streaming on/off, history encryption, diagnostics) beyond documented option defaults are unconfirmed.
