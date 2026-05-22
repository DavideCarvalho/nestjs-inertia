# @dudousxd/nestjs-inertia

> Inertia.js adapter for NestJS — core protocol and module.

[![npm](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia.svg)](https://npmjs.com/package/@dudousxd/nestjs-inertia)
[![license](https://img.shields.io/npm/l/@dudousxd/nestjs-inertia.svg)](https://github.com/DavideCarvalho/nestjs-inertia/blob/main/LICENSE)

> **Status: 0.1.0-alpha. Not ready for production.** API may change.

## Install

```bash
pnpm add @dudousxd/nestjs-inertia
pnpm add express @types/express          # for Express adapter (default)
```

## Quick start

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: 'v1',                    // or () => hash of build artifacts
      share: async (req) => ({          // optional global shared props
        auth: req.user ?? null,
      }),
    }),
  ],
})
export class AppModule {}
```

```ts
// home.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller()
export class HomeController {
  @Get('/')
  async show(@Req() req: Request): Promise<void> {
    await req.inertia.render('Home', { hello: 'world' });
  }
}
```

## Features (v0.1.0-alpha)

- **Inertia v2 protocol** — X-Inertia headers, version mismatch 409, partial reloads
- **`req.inertia.share() / render() / location() / encryptHistory() / clearHistory()`**
- **Prop markers** — `Inertia.always() / optional() / defer() / merge()` (+ `lazy()` alias for v1 compat)
- **Express adapter** — Fastify support coming in 0.2

## API

### `InertiaModule.forRoot(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `version` | `string \| () => Promise<string>` | UUID (dev) / SHA1 of Vite manifest (prod) | Asset version for cache-busting |
| `share` | `Props \| (req) => Props \| Promise<Props>` | `undefined` | Globally shared props on every render |
| `historyEncryption.default` | `boolean` | `false` | Default value of `page.encryptHistory` |
| `vite.manifestPath` | `string` | `'dist/inertia/client/.vite/manifest.json'` | Custom Vite manifest path |

### Prop markers

```ts
import { Inertia } from '@dudousxd/nestjs-inertia';

return {
  // resolves on every render (even partial reloads)
  user: Inertia.always(() => userService.current()),

  // resolves only when listed in X-Inertia-Partial-Data
  stats: Inertia.optional(() => statsService.heavy()),

  // returned as deferredProps; client v2 dispatches a follow-up request
  activity: Inertia.defer(() => activityFeed(), 'secondary'),

  // append/replace strategy; client v2 merges with matchOn key
  rows: Inertia.merge(() => paged(page), { matchOn: 'id', deep: false }),
};
```

## Not yet implemented (planned for 0.2+)

- `forRootAsync` / `forFeature` (multi-app)
- `@Inertia('Page')` decorator + `InertiaRenderInterceptor`
- Automatic 302→303 upgrade for PUT/PATCH/DELETE
- `_method` spoofing middleware
- CSRF token integration
- HTML shell directives (`@inertia`, `@vite`, `@inertiaHead`)
- Template engine adapter (Handlebars/EJS/Pug)
- Real SSR loading (currently stub — Phase 13)
- Fastify adapter (Phase 17)
- Testing helpers package (`@dudousxd/nestjs-inertia-testing`)
- Codegen package (`@dudousxd/nestjs-inertia-codegen`)
- Tuyau-style typed client (`@dudousxd/nestjs-inertia-client`)

See [`docs/design.md`](../../docs/design.md) for the full design spec.

## License

MIT © Davi Carvalho
