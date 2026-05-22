import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    glob: 'inertia/pages/**/*.vue',
    propsExport: 'ComponentProps',
  },
  app: {
    moduleEntry: './src/app.module.ts',
  },
});
