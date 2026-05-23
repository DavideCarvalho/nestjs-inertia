import { defineConfig } from 'tsup';

const external = [
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/platform-fastify',
  'rxjs',
  'reflect-metadata',
  '@dudousxd/nestjs-inertia',
  '@dudousxd/nestjs-inertia-codegen',
  '@dudousxd/nestjs-inertia-client',
  '@dudousxd/nestjs-inertia-vite',
  '@dudousxd/nestjs-inertia-testing',
  'vite',
  '@vitejs/plugin-react',
  '@vitejs/plugin-vue',
  '@sveltejs/vite-plugin-svelte',
];

const entry = {
  index: 'src/index.ts',
  'plugin/plugin': 'src/plugin/plugin.ts',
};

export default defineConfig([
  {
    entry,
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
  {
    entry,
    format: ['cjs'],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    // Shim import.meta.url for CJS: createRequire(import.meta.url) in plugin.ts
    banner: {
      js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
    },
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'import.meta.url': '__importMetaUrl',
      };
    },
    external,
  },
]);
