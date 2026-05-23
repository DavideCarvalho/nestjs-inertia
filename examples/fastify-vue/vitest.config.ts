import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.spec.ts'],
    pool: 'forks',
    testTimeout: 15000,
    environmentMatchGlobs: [['e2e/**', 'node']],
  },
});
