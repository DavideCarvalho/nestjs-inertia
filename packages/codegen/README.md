# @dudousxd/nestjs-inertia-codegen

> CLI + programmatic API that scans a NestJS + Inertia.js app and emits typed artifacts under `.nestjs-inertia/`.

[![npm version](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-codegen)](https://www.npmjs.com/package/@dudousxd/nestjs-inertia-codegen)

## Install

```bash
pnpm add -D @dudousxd/nestjs-inertia-codegen
pnpm add -D tsx   # required for loading nestjs-inertia.config.ts
```

## Quick Start

```bash
# 1. Scaffold config file + .gitignore patch + nestjs-inertia.d.ts augmentation stub
pnpm nestjs-inertia init

# 2. Generate typed artifacts (one-shot)
pnpm nestjs-inertia codegen

# 3. Watch mode — regenerates on every page file change (150ms debounce)
pnpm nestjs-inertia codegen --watch
```

After running `codegen`, the `.nestjs-inertia/` directory will contain:

```
.nestjs-inertia/
  pages.d.ts          # InertiaPages interface (page name → props type)
  routes.ts           # route() helper + RouteName union + RouteParams<K>
  shared-props.d.ts   # (placeholder, future)
  index.d.ts          # barrel re-export
  components.json     # cache manifest (name, relativePath, mtime)
```

Add `.nestjs-inertia/` to `.gitignore` (the `init` command does this automatically).

## Config Reference

Create `nestjs-inertia.config.ts` at the repo root (or let `init` scaffold it):

```ts
import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    // Glob pattern relative to cwd
    glob: 'inertia/pages/**/*.{tsx,vue,svelte}',
    // Named export that holds the per-page props type (default: 'ComponentProps')
    propsExport: 'ComponentProps',
    // How to derive the Inertia page name from the file path (default: 'relative-no-ext')
    // Options: 'relative-no-ext' | 'kebab' | ((relativePath: string) => string)
    componentNameStrategy: 'relative-no-ext',
  },
  codegen: {
    // Output directory for generated artifacts (default: '.nestjs-inertia')
    outDir: '.nestjs-inertia',
  },
  app: {
    // Entry module for route discovery (optional — routes.ts is skipped if absent)
    moduleEntry: 'src/app.module.ts',
    tsconfig: 'tsconfig.json',
  },
});
```

Full spec: [`/docs/superpowers/specs/2026-05-22-nestjs-inertia-plan-c-design.md`](../../docs/superpowers/specs/2026-05-22-nestjs-inertia-plan-c-design.md)

## CLI Reference

```
nestjs-inertia <command> [options]

Commands:
  init              Scaffold nestjs-inertia.config.ts, nestjs-inertia.d.ts, and
                    patch .gitignore. Safe to re-run (idempotent).
  codegen           One-shot generate: discover pages (+ routes if app.moduleEntry
                    is set) and write typed artifacts to codegen.outDir.
  codegen --watch   Watch mode: runs an initial codegen pass, then watches
                    pages.glob for changes and regenerates on each event
                    (150 ms debounce). Acquires a lock file to prevent duplicate
                    watchers in the same outDir.

Options:
  --help, -h        Show help
  --version, -v     Show version
```

> **Watch mode limitation:** `--watch` tracks page file changes only. It does **not** re-run route or contract discovery when you add or modify a controller. Route/contract artifacts (`routes.ts`, `api.ts`) are written once during the initial `generate()` pass. To pick up controller changes, restart the watcher (or run `nestjs-inertia codegen` one-shot).

## Programmatic API

```ts
import { defineConfig, loadConfig, generate, watch } from '@dudousxd/nestjs-inertia-codegen';
import type { UserConfig, ResolvedConfig } from '@dudousxd/nestjs-inertia-codegen';

// --- Config ---

// In nestjs-inertia.config.ts — provides type-checking + IDE completion
export default defineConfig({
  pages: { glob: 'inertia/pages/**/*.tsx' },
});

// Load config from disk (resolves defaults, makes paths absolute)
const config: ResolvedConfig = await loadConfig(process.cwd());

// --- One-shot generation ---
await generate(config);

// --- Watch mode ---
const watcher = await watch(config, () => {
  console.log('Pages regenerated');
});

// Shut down cleanly (releases lock file)
await watcher.close();
```

### Error classes

```ts
import { ConfigError, CodegenError } from '@dudousxd/nestjs-inertia-codegen';
```

- `ConfigError` — config file missing, invalid default export, or validation failure.
- `CodegenError` — emit or discovery failure.

## Module augmentation

After running `init`, a `nestjs-inertia.d.ts` file is created at the repo root:

```ts
import '@dudousxd/nestjs-inertia';
import type { InertiaPages } from './.nestjs-inertia/index.js';

declare module '@dudousxd/nestjs-inertia' {
  interface InertiaRegistry {
    pages: InertiaPages;
  }
}
```

This augments `InertiaRegistry` in core so page names and their prop types are available to the typed client (Plan D).

## License

MIT
