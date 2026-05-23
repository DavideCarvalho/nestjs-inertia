import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
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
    projects: [
      {
        // jsdom-based tests: React, Vue, Svelte component tests
        plugins: [react(), vue(), svelte()],
        resolve: {
          conditions: ['browser', 'module', 'import', 'default'],
        },
        test: {
          name: 'jsdom-tests',
          include: [
            'test/react/**/*.spec.{ts,tsx}',
            'test/vue/**/*.spec.{ts,tsx}',
            'test/svelte/**/*.spec.{ts,tsx}',
          ],
          environment: 'jsdom',
          pool: 'forks',
        },
      },
      {
        // Node-based tests: fetcher, contract, errors, url-builder, etc.
        test: {
          name: 'node-tests',
          include: [
            'test/*.spec.ts',
            'test/*.spec.tsx',
            'test/ssr/**/*.spec.ts',
          ],
          environment: 'node',
          pool: 'forks',
        },
      },
    ],
  },
});
