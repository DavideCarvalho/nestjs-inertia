import { defineConfig } from 'vitest/config';

// `environmentMatchGlobs` was removed in vitest 4; node is the default
// environment, so the e2e glob mapping is simply dropped.
export default defineConfig({
  test: {
    include: ['e2e/**/*.spec.ts'],
    pool: 'forks',
    testTimeout: 15000,
  },
});
