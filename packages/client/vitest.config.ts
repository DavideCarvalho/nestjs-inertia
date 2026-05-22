import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
    pool: 'forks',
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Only React tests need jsdom; others keep node
      ['test/react/**', 'jsdom'],
    ],
  },
});
