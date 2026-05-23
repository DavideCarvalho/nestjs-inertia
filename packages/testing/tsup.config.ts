import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    jest: 'src/jest.ts',
    vitest: 'src/vitest.ts',
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
    '@nestjs/testing',
    '@nestjs/platform-express',
    '@nestjs/platform-fastify',
    'rxjs',
    'reflect-metadata',
    '@dudousxd/nestjs-inertia',
    '@dudousxd/nestjs-inertia-codegen',
    '@dudousxd/nestjs-inertia-client',
    '@dudousxd/nestjs-inertia-vite',
    '@dudousxd/nestjs-inertia-testing',
    'vitest',
    'jest',
    '@jest/globals',
  ],
});
