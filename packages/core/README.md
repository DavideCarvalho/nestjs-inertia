# @dudousxd/nestjs-inertia

> Inertia.js v3 adapter for NestJS — Express + Fastify, multi-app via `forFeature`, 4 template engines, CSRF protection, full Inertia v3 protocol parity.

[![npm](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia.svg)](https://npmjs.com/package/@dudousxd/nestjs-inertia)
[![license](https://img.shields.io/npm/l/@dudousxd/nestjs-inertia.svg)](https://github.com/DavideCarvalho/nestjs-inertia/blob/main/LICENSE)

> **Status: v0.9.x alpha.** API is stabilising but may change before `1.0`. Not recommended for production use yet.

## Install

```bash
pnpm add @dudousxd/nestjs-inertia

# Pick your HTTP platform
pnpm add express @types/express          # Express adapter (default)
# OR
pnpm add fastify @nestjs/platform-fastify @fastify/cookie  # Fastify adapter
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

## Multi-app with `forFeature`

Host two or more Inertia apps in the same NestJS process — each with its own Vite entry, shell, version, share, SSR bundle. Useful for admin panels, multi-tenant white-label, or migrations between frontend stacks.

```ts
@Module({
  imports: [
    InertiaModule.forRoot({                  // main app
      vite: { entry: 'app/client.tsx' },
      rootView: 'inertia/root.html',
      share: req => ({ auth: req.user }),
    }),
    InertiaModule.forFeature({               // admin app
      scope: 'admin',
      vite: { entry: 'admin/client.tsx' },
      rootView: 'inertia/admin-root.html',
      share: req => ({ admin: req.adminContext }),
    }),
  ],
})
export class AppModule {}
```

Select scope per controller / method with `@UseInertia('scope')`:

```ts
@Controller('admin')
@UseInertia('admin')
export class AdminDashboardController {
  @Get('/')
  @Inertia('AdminDashboard')
  show() { return { stats: ... }; }
}
```

`forFeatureAsync` works the same as `forRootAsync` (useFactory/useClass/useExisting). Reserved scope: `'default'` is owned by `forRoot()`.

## Template engines

`rootView` accepts `.html` (own parser) plus `.hbs` / `.ejs` / `.pug` / `.liquid` if the engine package is installed:

```bash
pnpm add handlebars                    # or: ejs, pug, liquidjs
```

```ts
InertiaModule.forRoot({
  rootView: 'inertia/root.hbs',         // auto-detects Handlebars
});
```

Each engine sees locals `{ page, inertia, inertiaHead, vite, viteRefresh, asset }`. Use the engine's own escape rules (e.g., `{{{inertia}}}` triple-stache in Handlebars, `<%- inertia %>` in EJS, `!= inertia` in Pug). The `@inertia`/`@vite`/`@asset` directives are also processed on the engine's output, so you can mix and match.

## CSRF

```ts
import { CsrfCookieInterceptor, CsrfGuard } from '@dudousxd/nestjs-inertia';

// Global cookie writer
app.useGlobalInterceptors(new CsrfCookieInterceptor({ secret: process.env.CSRF_SECRET }));

// Per-route validation
@UseGuards(new CsrfGuard({ secret: process.env.CSRF_SECRET }))
@Post('/profile')
async update() { ... }
```

Cookie name `XSRF-TOKEN`, header name `X-XSRF-TOKEN` — both match the Inertia client convention. Signed via HMAC-SHA256. Requires `cookie-parser` (Express) or `@fastify/cookie` (Fastify) as peer dep.

## Fastify

```ts
import { FastifyAdapter } from '@nestjs/platform-fastify';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
```

Full feature parity with Express: middleware, decorator, all interceptors, guards, filters, shell directives, SSR, FlashStore. `request.inertia` is wired via `decorateRequest` + `onRequest` hook automatically when the FastifyAdapter is detected.

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
- `InertiaMiddleware` (Express) or `FastifyInertiaPlugin` (Fastify) — `req.inertia` available everywhere
- `MethodSpoofMiddleware` (POST + multipart + `_method=PUT/PATCH/DELETE`)
- `RedirectInterceptor` (302 → 303 upgrade on PUT/PATCH/DELETE Inertia requests)
- `InertiaRenderInterceptor` (handles `@Inertia('Page')` decorator)
- `InertiaScopeSwitcherInterceptor` (handles `@UseInertia('scope')`)

Disable via knobs:

```ts
InertiaModule.forRoot({
  methodSpoofing: false,
  autoUpgrade303: false,
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

// Not-found filter — register globally
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
    throwOnError: false,
  },
});
```

Bundle must export `default { render(page) }` or named `render(page)` returning `{ head: string[], body: string }`.

## Codegen auto-watch (dev mode)

When `@dudousxd/nestjs-inertia-codegen` is installed and a `nestjs-inertia.config.ts` config file is present, `InertiaModule` automatically starts the codegen file watcher inside `onApplicationBootstrap` — so `nest start --watch` is the only command you need in dev mode.

**Default behaviour (`enabled: 'auto'`):**
1. `NODE_ENV === 'production'` → always skipped.
2. Codegen package not installed → silent skip (no error).
3. No `nestjs-inertia.config.ts` found → silent skip.
4. Lock file already held by another watcher (e.g. the CLI `--watch` flag in a separate terminal) → the codegen package returns a no-op watcher; no conflict.

**Disable auto-watch** (run the CLI watcher manually, or in CI):

```ts
InertiaModule.forRoot({
  codegen: { enabled: false },
});
```

**Optional `nest-cli.json` snippet** — only useful if your server bundle imports generated files:

```json
{
  "compilerOptions": {
    "assets": [".nestjs-inertia/**/*"],
    "watchAssets": true
  }
}
```

## Protocol parity

Full Inertia v2 protocol: X-Inertia headers, version mismatch (409 + X-Inertia-Location, GET only), partial reloads, deferred props, merge/deepMerge with matchOn, once, history encryption / clear, error bags, X-Inertia-Reset, X-Inertia-Partial-Except, X-Inertia-Reset-Once, dot-notation unpacking, undefined→null wire conversion.

## Companion packages (planned)

- `@dudousxd/nestjs-inertia-vite` — Vite dev/build helpers (Plan B)
- `@dudousxd/nestjs-inertia-testing` — `expectInertia(res)` matchers (Plan B)
- `@dudousxd/nestjs-inertia-codegen` — typed pages (Plan C)
- `@dudousxd/nestjs-inertia-client` — Tuyau-style typed REST + TanStack Query (Plan D)
- Examples + docs site + CI workflows (Plan E)

See [`docs/design.md`](../../docs/design.md) for full design.

## License

MIT © Davi Carvalho
