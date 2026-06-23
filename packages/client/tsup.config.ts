import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'vue/index': 'src/vue/index.ts',
    'svelte/index': 'src/svelte/index.ts',
    'ssr/hydrate': 'src/ssr/hydrate.ts',
    'server/index': 'src/server/index.ts',
    'superjson/index': 'src/superjson/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  external: [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-express',
    '@nestjs/platform-fastify',
    'rxjs',
    'reflect-metadata',
    '@dudousxd/nestjs-inertia',
    '@dudousxd/nestjs-inertia-codegen',
    '@dudousxd/nestjs-inertia-client',
    '@dudousxd/nestjs-inertia-vite',
    '@dudousxd/nestjs-inertia-testing',
    'zod',
    '@inertiajs/react',
    '@inertiajs/vue3',
    '@inertiajs/svelte',
    'react',
    'vue',
    'svelte',
    '@tanstack/query-core',
    'superjson',
  ],
});
