import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [nestInertia({ svelte: true, root: '.', entry: 'inertia/app.ts' })],
});
