import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), vue()],
  test: {
    globals: false,
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
    pool: 'forks',
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Only React tests need jsdom; others keep node
      ['test/react/**', 'jsdom'],
      ['test/vue/**', 'jsdom'],
    ],
  },
});
