---
name: inertia-module-setup
description: >-
  Wire @dudousxd/nestjs-inertia into a NestJS app. Covers InertiaModule.forRoot,
  forRootAsync (useFactory/useClass/useExisting), forFeature multi-app scopes,
  rootView shell + @inertia/@inertiaHead/@vite directives, rendering with the
  @Inertia('Page') decorator vs imperative req.inertia.render(), @UseInertia
  scope selection, InertiaModuleOptions (share, version, ssr, methodSpoofing),
  and Express vs Fastify adapter setup. Use when adding Inertia to NestJS,
  configuring the module, or returning page props from a controller.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia"
  library_version: 1.8.0
  framework: nestjs
---

# Inertia module setup (NestJS)

`@dudousxd/nestjs-inertia` is an Inertia.js v3 server adapter for NestJS. You
register `InertiaModule`, point it at a `rootView` HTML shell, and render pages
either by decorating a handler with `@Inertia('PageName')` (return props) or by
calling `req.inertia.render('PageName', props)` imperatively.

## Setup

Install the core package and an HTTP platform:

```bash
pnpm add @dudousxd/nestjs-inertia
pnpm add express @types/express          # Express adapter (default)
# OR: pnpm add fastify @nestjs/platform-fastify @fastify/cookie
```

Register the module (it is `global: true`, so `req.inertia` is available everywhere):

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: () => process.env.ASSET_VERSION ?? 'dev',
      rootView: 'inertia/root.html',
      share: async (req) => ({ auth: (req as { user?: unknown }).user ?? null }),
    }),
  ],
})
export class AppModule {}
```

The `rootView` shell (`inertia/root.html`) MUST contain the `@inertia` and
`@inertiaHead` directives — they are where the page object and SSR head are
injected:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  @inertiaHead
  @vite('app/client.tsx')
  @viteRefresh
</head>
<body>
  @inertia
</body>
</html>
```

`forRoot()` auto-installs the middleware (`req.inertia`), method-spoofing
middleware, the `@Inertia` render interceptor, the `@UseInertia` scope switcher,
and the 302→303 redirect interceptor — no manual wiring needed.

## Core patterns

### 1. Decorator rendering (idiomatic) vs imperative render

```ts
import { Controller, Get, Req } from '@nestjs/common';
import { Inertia } from '@dudousxd/nestjs-inertia';
import type { Request } from 'express';

@Controller()
export class HomeController {
  // Decorator: whatever you return becomes the page props.
  @Get('/')
  @Inertia('Home')
  show() {
    return { hello: 'world' };
  }

  // Imperative: full control (share extra props, await async work).
  @Get('/crew')
  async list(@Req() req: Request) {
    await req.inertia
      .share({ flash: {} })
      .render('Crew', { crew: await this.svc.list() });
  }
}
```

The `@Inertia('Home')` interceptor calls `req.inertia.render('Home', returnValue)`
for you — but only if the handler did NOT already send headers. If you call
`req.inertia.render()` yourself inside a `@Inertia`-decorated handler, the
interceptor detects `res.headersSent` and does nothing (no double render).
`Source: packages/core/src/interceptor/render.interceptor.ts`

### 2. Async config

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

`forRootAsync` requires exactly one of `useFactory`, `useClass`, or `useExisting`
(class strategies implement `InertiaOptionsFactory.createInertiaOptions()`).
`Source: packages/core/src/module.ts`

### 3. Multi-app with forFeature + @UseInertia

Host several Inertia apps (e.g. a public site + an admin panel) in one process —
each with its own Vite entry, shell, version, and share. `forRoot()` owns the
reserved `'default'` scope; every `forFeature` needs a distinct `scope`.

```ts
@Module({
  imports: [
    InertiaModule.forRoot({ vite: { entry: 'app/client.tsx' }, rootView: 'inertia/root.html' }),
    InertiaModule.forFeature({
      scope: 'admin',
      vite: { entry: 'admin/client.tsx' },
      rootView: 'inertia/admin-root.html',
    }),
  ],
})
export class AppModule {}

@Controller('admin')
@UseInertia('admin')              // select the 'admin' scope for this controller
export class AdminController {
  @Get('/')
  @Inertia('AdminDashboard')
  show() { return { stats: {} }; }
}
```

`Source: packages/core/README.md, packages/core/src/decorator/use-inertia.decorator.ts`

## Common mistakes

### Mistake 1: rootView shell missing the directives

```html
<!-- Wrong: no @inertia → the app never mounts; no @inertiaHead → SSR <title>/meta lost -->
<body><div id="app"></div></body>
```

```html
<!-- Correct: the directives are the injection points the shell renderer fills -->
<head>@inertiaHead @vite('app/client.tsx')</head>
<body>@inertia</body>
```

Mechanism: the file shell renderer replaces `@inertia`/`@inertiaHead`/`@vite`
directives; without them the page object and asset tags are never emitted.
`Source: packages/core/README.md (Quick start), packages/core/src/shell/file-shell.renderer.ts`

### Mistake 2: forRootAsync with more than one strategy

```ts
// Wrong: useClass AND useFactory both set → throws InvalidInertiaConfigException at module build
InertiaModule.forRootAsync({ useClass: ConfigFactory, useFactory: () => ({}) });
```

```ts
// Correct: exactly one strategy
InertiaModule.forRootAsync({ inject: [ConfigService], useFactory: (c: ConfigService) => ({ version: c.get('V') }) });
```

Mechanism: `validateAsyncOptions` counts the declared strategies and throws
unless exactly one is present. `Source: packages/core/src/module.ts`

### Mistake 3: re-declaring InertiaModule per feature module

```ts
// Wrong: importing forRoot() again in a feature module — it is already global from AppModule
@Module({ imports: [InertiaModule.forRoot({ rootView: 'x.html' })] })
export class UsersModule {}
```

```ts
// Correct: forRoot once at the root; controllers everywhere already have req.inertia
@Module({ controllers: [UsersController] })
export class UsersModule {}
```

Mechanism: `forRoot()` returns a `global: true` dynamic module, so a single
registration exposes `req.inertia` app-wide; a second registration duplicates the
APP_INTERCEPTOR/APP_FILTER providers. `Source: packages/core/src/module.ts (forRoot returns { global: true })`
