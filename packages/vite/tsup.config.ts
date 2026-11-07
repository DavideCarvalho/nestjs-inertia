import { rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { defineConfig } from 'tsup';

const external = [
  // Node built-ins (e.g. path, fs, http, crypto …)
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),

  // NestJS / framework peers
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express',
  '@nestjs/platform-fastify',
  'rxjs',
  'reflect-metadata',

  // Monorepo siblings
  '@dudousxd/nestjs-inertia',
  '@dudousxd/nestjs-inertia-codegen',
  '@dudousxd/nestjs-inertia-client',
  '@dudousxd/nestjs-inertia-vite',
  '@dudousxd/nestjs-inertia-testing',

  // Vite ecosystem peers
  'vite',
  '@vitejs/plugin-react',
  '@vitejs/plugin-vue',
  '@sveltejs/vite-plugin-svelte',

  // Runtime deps that must NOT be bundled (CJS packages)
  'express',
  'body-parser',
  'depd',
  'cookie-parser',
  'ejs',
  'pug',
  'handlebars',
  'liquidjs',
];

const entry = {
  index: 'src/index.ts',
  'plugin/plugin': 'src/plugin/plugin.ts',
};

// tsup builds the entries of a config array concurrently, so a per-entry `clean: true` races the
// other passes and can delete files they already wrote (e.g. `index.d.cts`, seen under a loaded
// `turbo run build`). Clean the output directory once, before any pass starts, and let no entry
// clean. `scripts/check-package-exports.mjs` (prepack) fails the pack if an entry is still missing.
rmSync('dist', { recursive: true, force: true });

export default defineConfig([
  {
    entry,
    format: ['esm'],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external,
  },
  {
    entry,
    format: ['cjs'],
    // Emit CJS-flavoured declarations (*.d.cts) so the package "require"
    // condition resolves to declarations matching the CommonJS output under
    // NodeNext, rather than masquerading the ESM *.d.ts.
    dts: true,
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
