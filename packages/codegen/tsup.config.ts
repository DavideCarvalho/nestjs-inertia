import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/main': 'src/cli/main.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
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
    'cac',
    'chokidar',
    'fast-glob',
    'ts-morph',
  ],
});
