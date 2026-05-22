import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // skipFrameworkPlugin=true: @sveltejs/vite-plugin-svelte is ESM-only so we
    // load it directly here instead of relying on nestInertia's auto-loader.
    nestInertia({ svelte: true, skipFrameworkPlugin: true, root: '.', entry: 'inertia/app.ts' }),
    svelte(),
  ],
  resolve: {
    // @inertiajs/svelte v3 exports only the "svelte" condition — add it so
    // Vite/Rollup can resolve the package entrypoint.
    conditions: ['svelte', 'browser', 'module', 'import', 'default'],
  },
});
