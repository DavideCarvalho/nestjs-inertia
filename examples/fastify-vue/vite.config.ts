import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [nestInertia({ vue: true, root: '.', entry: 'inertia/app.ts' })],
});
