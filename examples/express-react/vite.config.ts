import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(__dirname, 'inertia'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: resolve(__dirname, 'inertia/index.html'),
    },
  },
});
