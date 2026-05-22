import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['e2e/**/*.spec.ts', 'test/**/*.spec.tsx'],
    pool: 'forks',
    testTimeout: 15000,
    environmentMatchGlobs: [
      ['test/**', 'jsdom'],
      ['e2e/**', 'node'],
    ],
  },
});
