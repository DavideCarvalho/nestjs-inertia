# nestjs-inertia

Inertia.js adapter for NestJS — TypeScript-first, multi-app, Tuyau-style typed client.

> Status: 0.5.0-alpha.0 (in development). Not ready for production.

See `docs/design.md` for the full design spec.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@dudousxd/nestjs-inertia`](packages/core/README.md) | `0.5.0-alpha.0` | Core protocol + module |
| [`@dudousxd/nestjs-inertia-vite`](packages/vite/README.md) | `0.5.0-alpha.0` | Vite dev/build helpers + plugin |
| [`@dudousxd/nestjs-inertia-testing`](packages/testing/README.md) | `0.5.0-alpha.0` | `expectInertia` matchers + fakes + TestingModule |
| [`@dudousxd/nestjs-inertia-codegen`](packages/codegen/README.md) | `0.5.0-alpha.0` | Typed pages + routes via `nestjs-inertia codegen` |

## Highlights — 0.5.0-alpha.0

- Typed pages + routes via `nestjs-inertia codegen` — scan your NestJS app and emit `.d.ts` artifacts to `.nestjs-inertia/`
- `InertiaRegistry` interface in core, ready for codegen augmentation
- `@dudousxd/nestjs-inertia-codegen` — new standalone package with CLI (`init`, `codegen --watch`) and programmatic API (`generate`, `watch`)

## License

MIT
