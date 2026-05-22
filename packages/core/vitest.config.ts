import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.{spec,test}.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    poolMatchGlobs: [
      [new URL('./test/asset-version.spec.ts', import.meta.url).pathname, 'forks'],
      [new URL('./test/file-shell-renderer.spec.ts', import.meta.url).pathname, 'forks'],
      [new URL('./test/e2e/shell-directives.e2e-spec.ts', import.meta.url).pathname, 'forks'],
      [new URL('./test/e2e/ssr.e2e-spec.ts', import.meta.url).pathname, 'forks'],
    ],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
