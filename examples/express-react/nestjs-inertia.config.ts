import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    glob: 'inertia/pages/**/*.tsx',
    propsExport: 'ComponentProps',
  },
  app: {
    moduleEntry: './src/app.module.ts',
  },
});
