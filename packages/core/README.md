# @dudousxd/nestjs-inertia

> Inertia.js v2 adapter for NestJS — core protocol and module.

[![npm](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia.svg)](https://npmjs.com/package/@dudousxd/nestjs-inertia)
[![license](https://img.shields.io/npm/l/@dudousxd/nestjs-inertia.svg)](https://github.com/DavideCarvalho/nestjs-inertia/blob/main/LICENSE)

> **Status: 0.2.0-alpha.** Express adapter complete with full Inertia v2 protocol parity. Fastify, multi-app (forFeature), template engines, and CSRF arrive in 0.3.0 (Plan A.3).

## Install

```bash
pnpm add @dudousxd/nestjs-inertia
pnpm add express @types/express          # Express adapter peer deps
```

## Quick start

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: () => process.env.ASSET_VERSION ?? 'dev',
      rootView: 'inertia/root.html',
      share: async (req) => ({ auth: req.user ?? null }),
    }),
  ],
})
export class AppModule {}
```

`inertia/root.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>My App</title>
  @inertiaHead
  @vite('app/client.tsx')
  @viteRefresh
</head>
<body>
  @inertia
</body>
</html>
```

## Controllers

Two equivalent patterns coexist:

```ts
import { Controller, Get, Req } from '@nestjs/common';
import { Inertia } from '@dudousxd/nestjs-inertia';
import type { Request } from 'express';

@Controller()
export class HomeController {
  // Decorator pattern (idiomatic for new code)
  @Get('/')
  @Inertia('Home')
  show() {
    return { hello: 'world' };
  }

  // Imperative pattern (use when you need fine control)
  @Get('/crew')
  async list(@Req() req: Request) {
    await req.inertia
      .share({ flash: req.session?.flash ?? {} })
      .render('Crew', { crew: await this.svc.list() });
  }
}
```

## Async config

```ts
InertiaModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    version: cfg.get('ASSET_VERSION'),
    rootView: 'inertia/root.html',
  }),
});
```

Three paths: `useFactory + inject` (most common), `useClass`, `useExisting`.

## Prop markers

```ts
import { Inertia } from '@dudousxd/nestjs-inertia';

return {
  user: Inertia.always(() => currentUser()),
  stats: Inertia.optional(() => heavyStatsCalculation()),
  activity: Inertia.defer(() => activityFeed(), 'secondary'),
  rows: Inertia.merge(() => paginated(p), { matchOn: 'id', deep: false }),
  csrfToken: Inertia.once(() => generateToken()),
};
```

- `always` — resolves on every render (including partial reloads)
- `optional` — resolves only when listed in `X-Inertia-Partial-Data`
- `defer` — listed in `page.deferredProps`; client v2 dispatches a follow-up request
- `merge` — resolves + marks as merge target (client appends/replaces)
- `once` — resolves on first visit, cached until `X-Inertia-Reset-Once` lists the key
- `lazy` — alias for `optional` (v1 compat)

## Auto-included infrastructure

`forRoot()` installs:
- `InertiaMiddleware` on all routes (`req.inertia` available everywhere)
- `MethodSpoofMiddleware` (POST + multipart + `_method=PUT/PATCH/DELETE`)
- `RedirectInterceptor` (302 → 303 upgrade on PUT/PATCH/DELETE Inertia requests)
- `InertiaRenderInterceptor` (handles `@Inertia('Page')` decorator)

Disable via knobs:

```ts
InertiaModule.forRoot({
  methodSpoofing: false,   // disable _method override
  autoUpgrade303: false,   // disable 302→303 (NOT recommended; breaks forms)
});
```

## Opt-in utilities

```ts
import {
  InertiaAuthGuard,
  InertiaNotFoundFilter,
  ErrorBagInterceptor,
} from '@dudousxd/nestjs-inertia';

// Auth guard — applies per controller / handler
@UseGuards(new InertiaAuthGuard({ signInUrl: '/signin', allowList: ['/signin/*'] }))

// Not-found filter — register globally in main.ts
app.useGlobalFilters(new InertiaNotFoundFilter({ apiPrefix: '/api', component: 'NotFound' }));

// Error bag interceptor — opt-in per route
@UseInterceptors(ErrorBagInterceptor)
```

## FlashStore (errors)

NestJS has no session of its own. Plug an adapter:

```ts
import type { FlashStore } from '@dudousxd/nestjs-inertia';

class ExpressSessionFlashStore implements FlashStore {
  read(req) {
    return (req as Request).session?.flash?.errors ?? {};
  }
}

InertiaModule.forRoot({
  flashStore: new ExpressSessionFlashStore(),
});
```

## SSR

```ts
InertiaModule.forRoot({
  ssr: {
    enabled: process.env.NODE_ENV === 'production',
    bundlePath: 'dist/inertia/ssr/ssr.mjs',
    throwOnError: false,    // log warn + CSR fallback on missing bundle
  },
});
```

Bundle must export `default { render(page) }` or named `render(page)` returning `{ head: string[], body: string }`.

## Protocol parity

Full Inertia v2 protocol: X-Inertia headers, version mismatch (409 + X-Inertia-Location, GET only), partial reloads, deferred props, merge/deepMerge with matchOn, once, history encryption / clear, error bags, X-Inertia-Reset, X-Inertia-Partial-Except, dot-notation unpacking, undefined→null wire conversion.

## Not yet (planned for 0.3.0 / Plan A.3)

- `InertiaModule.forFeature({ scope })` for multi-app (`@UseInertia('admin')`)
- Template engines (Handlebars/EJS/Pug/Liquid) for `rootView`
- CSRF (`CsrfCookieInterceptor` + `CsrfGuard`)
- Fastify adapter

## Companion packages (planned)

- `@dudousxd/nestjs-inertia-vite` — Vite dev/build helpers
- `@dudousxd/nestjs-inertia-testing` — `expectInertia(res)` matchers
- `@dudousxd/nestjs-inertia-codegen` — typed pages
- `@dudousxd/nestjs-inertia-client` — Tuyau-style typed REST + TanStack Query

See [`docs/design.md`](../../docs/design.md) for full design.

## License

MIT © Davi Carvalho
