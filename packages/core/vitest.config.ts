import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.{spec,test}.ts'],
    setupFiles: ['reflect-metadata'],
    poolMatchGlobs: [
      [new URL('./test/asset-version.spec.ts', import.meta.url).pathname, 'forks'],
    ],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
