import { defineConfig } from 'vite';
import nestInertia from '@dudousxd/nestjs-inertia-vite/plugin';

export default defineConfig({
  plugins: [nestInertia({ react: true, root: '.', entry: 'inertia/app.tsx' })],
});
