# Codegen reference

`@dudousxd/nestjs-inertia-codegen` provides a CLI that statically analyses your NestJS application and emits TypeScript type files so that your frontend and any API client are fully type-safe.

## Installation

```bash
pnpm add -D @dudousxd/nestjs-inertia-codegen
```

## Configuration

Create `nestjs-inertia.config.ts` at your project root:

```ts
import { defineConfig } from '@dudousxd/nestjs-inertia-codegen';

export default defineConfig({
  pages: {
    // Glob pattern for Inertia page components
    glob: 'inertia/pages/**/*.tsx',
    // Named export that holds the page's prop type
    propsExport: 'ComponentProps',
  },
  app: {
    // Path to the NestJS AppModule (used to discover controllers)
    moduleEntry: './src/app.module.ts',
  },
  // Optional: where to emit generated files (default: .nestjs-inertia/)
  outDir: '.nestjs-inertia',
});
```

## Running

```bash
pnpm nestjs-inertia codegen
```

Or add a script to `package.json`:

```json
{
  "scripts": {
    "codegen": "nestjs-inertia codegen"
  }
}
```

## Output structure

After running, the following files are emitted in `outDir` (default: `.nestjs-inertia/`):

```
.nestjs-inertia/
  pages.d.ts   — union type of all known Inertia page component names
  routes.ts    — typed route helpers derived from @Inertia() metadata
  api.ts       — typed client API surface derived from @ApplyContract() metadata
```

### `pages.d.ts`

A string union of all page names discovered from the glob:

```ts
// .nestjs-inertia/pages.d.ts
export type InertiaPages = 'Dashboard' | 'Users' | 'Settings';
```

Use this type to constrain the `component` argument wherever you construct Inertia responses programmatically.

### `routes.ts`

Typed route helpers for use in templates and tests:

```ts
// .nestjs-inertia/routes.ts
export const routes = {
  dashboard: () => '/dashboard',
  users: { list: () => '/api/users' },
} as const;
```

### `api.ts`

Typed API surface assembled from `@ApplyContract` metadata on your controllers:

```ts
// .nestjs-inertia/api.ts
export interface InertiaApi {
  'users.list': {
    method: 'GET';
    url: '/api/users';
    query: { active?: boolean };
    response: Array<{ id: string; name: string }>;
  };
}
```

This file is consumed by `@dudousxd/nestjs-inertia-client`'s `createFetcher` to produce a fully typed client.

## `@ApplyContract` example

On your controller:

```ts
import { Controller } from '@nestjs/common';
import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { z } from 'zod';

const ListUsers = Contract.get('/api/users', {
  query: z.object({ active: z.boolean().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
  name: 'users.list',
});

@Controller()
export class UsersController {
  @ApplyContract(ListUsers)
  list() {
    return [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
  }
}
```

After running `pnpm codegen`, the `users.list` contract appears in `api.ts`. On the client:

```ts
import { createFetcher } from '@dudousxd/nestjs-inertia-client';
import type { InertiaApi } from './.nestjs-inertia/api.js';

const api = createFetcher<InertiaApi>({ baseURL: '' });

// Fully typed — TypeScript knows the query shape and response type.
const users = await api['users.list']({ query: { active: true } });
```

## Watch mode

Run codegen in watch mode during development:

```bash
pnpm nestjs-inertia codegen --watch
```

This re-runs whenever a controller or page file changes.

## Generated file management

Add the output directory to version control so that CI has types without running the CLI. Add to `.gitignore` only if you prefer to always generate on install (add a `postinstall` script in that case).
