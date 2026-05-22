# nestjs-inertia

Inertia.js adapter for NestJS — TypeScript-first, multi-app, Tuyau-style typed client.

![Status: alpha](https://img.shields.io/badge/status-alpha-orange) ![Version](https://img.shields.io/badge/version-0.6.0--alpha.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

> **Alpha status:** All packages are at `0.6.0-alpha.0`. The API is stabilising but breaking changes may occur before `1.0`. Not recommended for production use yet.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@dudousxd/nestjs-inertia`](packages/core/README.md) | `0.6.0-alpha.0` | Core protocol + module |
| [`@dudousxd/nestjs-inertia-vite`](packages/vite/README.md) | `0.6.0-alpha.0` | Vite dev/build helpers + plugin |
| [`@dudousxd/nestjs-inertia-testing`](packages/testing/README.md) | `0.6.0-alpha.0` | `expectInertia` matchers + fakes + TestingModule |
| [`@dudousxd/nestjs-inertia-codegen`](packages/codegen/README.md) | `0.6.0-alpha.0` | Typed pages + routes + `api.ts` via `nestjs-inertia codegen` |
| [`@dudousxd/nestjs-inertia-client`](packages/client/README.md) | `0.6.0-alpha.0` | Tuyau-style typed HTTP client (Contract + createFetcher + SSR hydration) |

## Highlights — 0.6.0-alpha.0

- New package: `@dudousxd/nestjs-inertia-client` — Tuyau-style typed HTTP client with `Contract` builders, `@ApplyContract` decorator, `createFetcher`, and SSR hydration helpers
- Codegen now emits `api.ts` — discovers `@ApplyContract` metadata on controllers and generates a typed client API
- All packages bumped to `0.6.0-alpha.0`

## Examples

Three end-to-end example apps demonstrate different adapter + frontend combinations:

| Example | Stack | Run |
|---------|-------|-----|
| [`examples/express-react/`](examples/express-react/) | Express + React + Vite | `pnpm --filter @example/express-react dev` |
| [`examples/fastify-vue/`](examples/fastify-vue/) | Fastify + Vue 3 + Vite | `pnpm --filter @example/fastify-vue dev` |
| [`examples/express-svelte/`](examples/express-svelte/) | Express + Svelte 5 + Vite | `pnpm --filter @example/express-svelte dev` |

`express-react` is the canonical reference that exercises all five packages including the typed `<Link>` component and `@ApplyContract` codegen.

To run any example:

```bash
pnpm install
pnpm --filter @example/express-react dev  # or fastify-vue / express-svelte
```

## Docs

Full documentation site: **https://davidecarvalho.github.io/nestjs-inertia/**

| Document | Description |
|---|---|
| [Getting Started](https://davidecarvalho.github.io/nestjs-inertia/getting-started/) | 5-minute walkthrough |
| [Guides](https://davidecarvalho.github.io/nestjs-inertia/guides/installation/) | Installation, multi-app, testing, codegen, typed client |
| [Packages](https://davidecarvalho.github.io/nestjs-inertia/packages/core/) | Per-package API reference |
| [Architecture](https://davidecarvalho.github.io/nestjs-inertia/reference/architecture/) | Package responsibilities and request lifecycle |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, TDD discipline, commit style, Changesets flow |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1 |

## License

MIT — Copyright (c) 2026 Davide Carvalho
