import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.{spec,test}.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    // Vitest 3 removed poolMatchGlobs. Use forks for the whole suite — several
    // tests (asset-version, file-shell-renderer, e2e SSR, template-engines,
    // fastify-parity, forFeature-fastify, ssr-loader.real) need real fs +
    // dynamic-import semantics that the default threads pool doesn't provide.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
