import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), vue(), svelte()],
  resolve: {
    // Svelte 5 needs the "browser" condition to pick the client build
    // (without it, jsdom gets svelte/index-server.js which throws on mount)
    conditions: ['browser', 'module', 'import', 'default'],
  },
  test: {
    globals: false,
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
    pool: 'forks',
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['test/react/**', 'jsdom'],
      ['test/vue/**', 'jsdom'],
      ['test/svelte/**', 'jsdom'],
    ],
  },
});
