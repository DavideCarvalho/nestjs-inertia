# @dudousxd/nestjs-inertia-vite

> Vite integration for `@dudousxd/nestjs-inertia` — dev middleware mode, prod static serving, plugin.

## Install

```bash
pnpm add @dudousxd/nestjs-inertia-vite
pnpm add vite @vitejs/plugin-react   # or @vitejs/plugin-vue, @sveltejs/vite-plugin-svelte
```

## main.ts setup

```ts
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';

const app = await NestFactory.create(AppModule);
await setupInertiaVite(app, {
  mode: process.env.NODE_ENV,
  root: 'inertia',
  publicDir: 'inertia/public',
  outDir: 'dist/inertia',
});
```

## vite.config.ts

```ts
import { defineConfig } from 'vite';
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';

export default defineConfig({
  plugins: [
    nestInertia({
      ssr: true,
      react: true,    // OR vue: true, OR svelte: true (exactly one)
      clientEntry: 'app/client.tsx',
      ssrEntry: 'ssr/entry.tsx',
    }),
  ],
});
```

## License

MIT
