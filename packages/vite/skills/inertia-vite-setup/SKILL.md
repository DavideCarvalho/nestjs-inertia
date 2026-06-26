---
name: inertia-vite-setup
description: >-
  Vite dev/build glue for @dudousxd/nestjs-inertia-vite. Covers setupInertiaVite
  (middleware-mode dev server + production static serving of dist/<outDir>/client)
  and the nestInertia() Vite plugin (exactly one of react/vue/svelte flags,
  manifest build, codegen HMR, root/entry/alias/outDir config, skipFrameworkPlugin),
  plus InvalidViteConfigException. Use when wiring Vite HMR into a NestJS server,
  configuring vite.config for an Inertia front end, or building client assets.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia-vite"
  library_version: 1.5.0
  framework: nestjs
---

# Inertia Vite setup

`@dudousxd/nestjs-inertia-vite` has two halves: `setupInertiaVite(app, options)`
runs inside your NestJS bootstrap to mount Vite in middleware mode (dev) or serve
built assets (prod), and `nestInertia()` is the Vite plugin you add to
`vite.config.ts` to build the Inertia client (and optionally SSR) bundle.

## Setup

```bash
pnpm add -D @dudousxd/nestjs-inertia-vite vite
pnpm add -D @vitejs/plugin-react        # or @vitejs/plugin-vue / @sveltejs/vite-plugin-svelte
```

Server bootstrap (Express, middleware mode in dev):

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await setupInertiaVite(app, {
    mode: process.env.NODE_ENV,
    root: 'inertia',
    publicDir: 'public',
    outDir: 'dist/inertia',
  });
  await app.listen(3000);
}
bootstrap();
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import nestInertia from '@dudousxd/nestjs-inertia-vite';

export default defineConfig({
  plugins: [nestInertia({ react: true })],
});
```

`Source: packages/vite/src/setup.ts, packages/vite/src/plugin/plugin.ts, packages/vite/src/index.ts`

## Core patterns

### 1. setupInertiaVite — dev vs prod branch

When `options.mode !== 'production'`, it creates a Vite server in
`middlewareMode` (HMR on port `hmrPort ?? 24679`) and mounts `vite.middlewares`.
In production it serves `dist/<outDir>/client` statically — `/assets` with a
1-year immutable cache, the rest with a 1-hour cache. The `mode` you pass is the
ONLY switch between the two paths. `Source: packages/vite/src/setup.ts`

### 2. nestInertia plugin — one framework, sensible defaults

```ts
nestInertia({
  react: true,                 // exactly one of react | vue | svelte
  root: 'inertia',             // alias '@' → <cwd>/inertia
  entry: 'inertia/app/client.tsx',
  ssr: true,
});
```

The plugin returns an array: a config plugin (`manifest: true`, default
`outDir: 'dist/inertia/client'`, rollup input from `entry`/`clientEntry`), the
framework plugin (auto-loaded), and a codegen-HMR plugin that watches
`.nestjs-inertia/` and triggers a full reload when generated files change. It
only sets `root`/`outDir`/`input` when you have not already defined them.
`Source: packages/vite/src/plugin/plugin.ts`

### 3. Bringing your own framework plugin

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [nestInertia({ svelte: true, skipFrameworkPlugin: true }), svelte()],
});
```

`skipFrameworkPlugin: true` makes `nestInertia` return only the configurer +
codegen-HMR plugins, so you add the framework plugin yourself.
`Source: packages/vite/src/plugin/plugin.ts (skipFrameworkPlugin branch)`

## Common mistakes

### Mistake 1: passing zero or multiple framework flags

```ts
// Wrong: both react and vue → throws InvalidViteConfigException at config load
nestInertia({ react: true, vue: true });
```

```ts
// Correct: exactly one framework flag
nestInertia({ react: true });
```

Mechanism: the plugin counts truthy framework flags and throws unless exactly one
is set. `Source: packages/vite/src/plugin/plugin.ts (frameworkFlags.length !== 1)`

### Mistake 2: omitting the framework plugin dependency

```ts
// Wrong: nestInertia({ react: true }) but @vitejs/plugin-react not installed
// → InvalidViteConfigException: Plugin "@vitejs/plugin-react" not installed
```

```bash
# Correct: install the matching framework plugin (auto-loaded by nestInertia)
pnpm add -D @vitejs/plugin-react
```

Mechanism: `loadFrameworkPlugin` `require()`s the framework package and rethrows
as `InvalidViteConfigException` with the install command when it is missing.
`Source: packages/vite/src/plugin/plugin.ts (loadFrameworkPlugin)`

### Mistake 3: forgetting that the dev/prod switch is `mode`

```ts
// Wrong: leaving mode undefined in production → falls into the dev Vite branch
await setupInertiaVite(app, { mode: undefined, root: 'inertia', publicDir: 'public', outDir: 'dist/inertia' });
```

```ts
// Correct: pass the real mode so prod serves built static assets
await setupInertiaVite(app, { mode: process.env.NODE_ENV, root: 'inertia', publicDir: 'public', outDir: 'dist/inertia' });
```

Mechanism: the prod static-serving branch runs only when `mode === 'production'`;
any other value (including `undefined`) starts an in-process Vite dev server.
`Source: packages/vite/src/setup.ts (if options.mode !== 'production')`
