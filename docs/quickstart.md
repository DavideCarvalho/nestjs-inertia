# Quickstart — 5-minute guide

This guide walks you from zero to a running NestJS + Inertia + React app.

## 1. Install

```bash
pnpm add @dudousxd/nestjs-inertia @dudousxd/nestjs-inertia-vite
pnpm add -D @dudousxd/nestjs-inertia-codegen vite @vitejs/plugin-react
```

> **Alpha notice:** All packages are currently at `0.6.0-alpha.0`. The public API is stable within the alpha series but may change before `1.0`.

## 2. Bootstrap NestJS

```ts
// src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

```ts
// src/app.module.ts
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { DashboardController } from './dashboard.controller.js';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: '1',
      rootView: 'inertia/index.html',
    }),
  ],
  controllers: [DashboardController],
})
export class AppModule {}
```

## 3. Add a page controller

```ts
// src/dashboard.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Inertia } from '@dudousxd/nestjs-inertia';

@Controller()
export class DashboardController {
  @Get('/dashboard')
  @Inertia('Dashboard')
  index() {
    return { user: { id: 1, name: 'Alice' }, count: 42 };
  }
}
```

The return value of the method becomes the `props` of the Inertia page component.

## 4. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { nestInertia } from '@dudousxd/nestjs-inertia-vite';

export default defineConfig({
  plugins: [nestInertia({ react: true })],
  build: {
    outDir: 'dist/client',
    manifest: true,
    rollupOptions: { input: ['inertia/app.tsx'] },
  },
});
```

## 5. Write the HTML shell

```html
<!-- inertia/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="app" data-page="{{page}}"></div>
    <script type="module" src="/inertia/app.tsx"></script>
  </body>
</html>
```

## 6. Wire the React entry point

```tsx
// inertia/app.tsx
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/*.tsx', { eager: true });
    return (pages as any)[`./pages/${name}.tsx`];
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
});
```

## 7. Write your first page

```tsx
// inertia/pages/Dashboard.tsx
export type ComponentProps = {
  user: { id: number; name: string };
  count: number;
};

export default function Dashboard({ user, count }: ComponentProps) {
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Hello, {user.name}!</p>
      <p>Count: {count}</p>
    </main>
  );
}
```

## 8. Run in development

```bash
# Terminal 1 — Vite dev server
pnpm vite

# Terminal 2 — NestJS
node --import tsx src/main.ts
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## 9. (Optional) Run codegen

Add a `nestjs-inertia.config.ts` to your project root:

```ts
import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    glob: 'inertia/pages/**/*.tsx',
    propsExport: 'ComponentProps',
  },
  app: {
    moduleEntry: './src/app.module.ts',
  },
});
```

Then run:

```bash
pnpm nestjs-inertia codegen
```

This emits `.nestjs-inertia/pages.d.ts`, `routes.ts`, and `api.ts` — full type-safety for page names and route helpers.

See [codegen.md](codegen.md) for details.

## 10. (Optional) Typed REST contracts

Use `@dudousxd/nestjs-inertia-client` to declare and share Zod-typed API contracts between your server and client. See [architecture.md](architecture.md) for an overview, and the `examples/express-react/` app for a working end-to-end example.
