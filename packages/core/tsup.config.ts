import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external: [
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-express',
      '@nestjs/platform-fastify',
      'rxjs',
      'reflect-metadata',
      '@fastify/cookie',
      'cookie-parser',
      'express',
      'fastify',
      'ejs',
      'handlebars',
      'liquidjs',
      'pug',
    ],
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    // Emit a CJS-flavoured declaration (index.d.cts) so the package "require"
    // condition resolves to declarations matching the CommonJS output under
    // NodeNext, rather than masquerading the ESM index.d.ts.
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    // Shim import.meta.url for CJS: createRequire(import.meta.url) in shell adapters
    banner: {
      js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
    },
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'import.meta.url': '__importMetaUrl',
      };
    },
    external: [
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-express',
      '@nestjs/platform-fastify',
      'rxjs',
      'reflect-metadata',
      '@fastify/cookie',
      'cookie-parser',
      'express',
      'fastify',
      'ejs',
      'handlebars',
      'liquidjs',
      'pug',
    ],
  },
]);
