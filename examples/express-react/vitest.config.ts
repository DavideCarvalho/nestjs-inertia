import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `environmentMatchGlobs` was removed in vitest 4 — split into projects
// instead (same pattern as packages/client): jsdom for component tests,
// node for the e2e smoke tests.
export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'forks',
    testTimeout: 15000,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'components',
          include: ['test/**/*.spec.tsx'],
          environment: 'jsdom',
          pool: 'forks',
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['e2e/**/*.spec.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 15000,
        },
      },
    ],
  },
});
