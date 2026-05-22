# nestjs-inertia

Inertia.js adapter for NestJS — TypeScript-first, multi-app, Tuyau-style typed client.

> Status: 0.6.0-alpha.0 (in development). Not ready for production.

See `docs/design.md` for the full design spec.

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

## License

MIT
