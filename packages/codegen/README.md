# @dudousxd/nestjs-inertia-codegen

> CLI + programmatic API that scans a NestJS + Inertia.js app and emits typed artifacts under `.nestjs-inertia/`.

## Install

```bash
pnpm add -D @dudousxd/nestjs-inertia-codegen
pnpm add -D tsx   # required for loading nestjs-inertia.config.ts
```

## Quick Start

```bash
# 1. Scaffold config file + .gitignore patch
pnpm nestjs-inertia init

# 2. Generate typed artifacts (one-shot)
pnpm nestjs-inertia codegen

# 3. Watch mode
pnpm nestjs-inertia codegen --watch
```

## Config Reference

`nestjs-inertia.config.ts` at the repo root:

```ts
import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    glob: 'inertia/pages/**/*.{tsx,vue,svelte}',
    propsExport: 'ComponentProps',           // default
    componentNameStrategy: 'relative-no-ext', // default
  },
  codegen: {
    outDir: '.nestjs-inertia',               // default
  },
  app: {
    moduleEntry: 'src/app.module.ts',         // for route discovery
    tsconfig: 'tsconfig.json',
  },
});
```

## CLI Reference

```
nestjs-inertia init           scaffold config + gitignore + nestjs-inertia.d.ts
nestjs-inertia codegen        one-shot generate
nestjs-inertia codegen --watch  watch mode (debounced, 150ms)
```

## Programmatic API

```ts
import { loadConfig, generate, watch } from '@dudousxd/nestjs-inertia-codegen';

const config = await loadConfig(process.cwd());
await generate(config);

// or
const watcher = watch(config, () => console.log('regenerated'));
// later
await watcher.close();
```

## License

MIT
