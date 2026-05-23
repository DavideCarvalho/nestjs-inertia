# @dudousxd/nestjs-inertia-client

Tuyau-style typed HTTP client for `@dudousxd/nestjs-inertia`, built on TanStack Query v5 core.

[![npm version](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-client)](https://www.npmjs.com/package/@dudousxd/nestjs-inertia-client)

> `v0.9.x alpha` — in active development. API may change before 1.0.

## Install

```bash
pnpm add @dudousxd/nestjs-inertia-client @tanstack/query-core zod
```

## Quick Start

### 1. Define a Contract

```ts
import { Contract } from '@dudousxd/nestjs-inertia-client';
import { z } from 'zod';

export const listUsersContract = Contract.get('/users', {
  query: z.object({ page: z.number().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const createUserContract = Contract.post('/users', {
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: z.object({ id: z.string(), name: z.string() }),
});
```

### 2. Bind a Contract to a NestJS Handler with `@ApplyContract`

```ts
import { Controller, Get, Post } from '@nestjs/common';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client';
import { listUsersContract, createUserContract } from './contracts.js';

@Controller()
export class UserController {
  @Get('/users')
  @ApplyContract(listUsersContract)
  listUsers() { /* ... */ }

  @Post('/users')
  @ApplyContract(createUserContract)
  createUser() { /* ... */ }
}
```

`@ApplyContract` stores the contract definition under `CONTRACT_METADATA` so that `@dudousxd/nestjs-inertia-codegen` can discover it and emit a typed `api.ts` file.

### 3. Create a Fetcher and Call Endpoints

```ts
import { createFetcher } from '@dudousxd/nestjs-inertia-client';

const fetcher = createFetcher({
  baseUrl: 'http://localhost:3000',
  headers: () => ({
    Authorization: `Bearer ${getToken()}`,
  }),
});

// GET /users?page=1
const users = await fetcher.get<User[]>('/users', { query: { page: 1 } });

// POST /users
const newUser = await fetcher.post<User>('/users', {
  body: { name: 'Alice', email: 'alice@example.com' },
});
```

The generated `api.ts` (emitted by `nestjs-inertia codegen`) wraps `createFetcher` with full request/response types derived from your contracts.

### 4. Handle Errors

```ts
import { ApiHttpError } from '@dudousxd/nestjs-inertia-client';

try {
  await fetcher.post('/users', { body: { name: '' } });
} catch (err) {
  if (err instanceof ApiHttpError) {
    console.error(err.status, err.body);
  }
}
```

## SSR Hydration

Import SSR helpers from the `/ssr` subpath:

```ts
import {
  hydrateClientFromInertia,
  seedInitialQueries,
} from '@dudousxd/nestjs-inertia-client/ssr';
import { QueryClient } from '@tanstack/query-core';
```

### Server side (NestJS)

```ts
// In your Inertia controller, seed the QueryClient and attach its cache to shared props
const qc = new QueryClient();
await qc.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers });

return inertia.render('Dashboard', {
  _initialQueries: seedInitialQueries(qc),
});
```

### Client side

```ts
// In your client entry point, rehydrate from Inertia's page props
const page = window.__INERTIA_PAGE__;   // or however you access the Inertia page object
const queryClient = hydrateClientFromInertia(page);
```

This avoids a second network round-trip for data the server already fetched during SSR.

## API Reference

### `Contract`

Builder object with methods: `Contract.get`, `Contract.post`, `Contract.put`, `Contract.patch`, `Contract.delete`. Each accepts a path and a definition with optional `query` / `body` and required `response` Zod schemas.

### `@ApplyContract(contractDef)`

NestJS method decorator. Attaches the contract to the handler via `Reflect` metadata under `CONTRACT_METADATA`. Used by codegen for `api.ts` contract discovery.

### `createFetcher(opts?): Fetcher`

Creates a typed fetch wrapper. Options:

| Option | Type | Description |
|---|---|---|
| `baseUrl` | `string` | Prepended to every request path |
| `headers` | `() => Record<string, string>` | Dynamic headers (auth tokens, etc.) |
| `fetch` | `typeof fetch` | Custom fetch implementation (useful in tests) |
| `onError` | `(err: ApiHttpError) => void` | Called before an `ApiHttpError` is thrown |

### `ApiHttpError`

Thrown when the server responds with a non-2xx status. Properties: `.status: number`, `.body: unknown`.

### `invalidate(queryClient, queryKey)`

Convenience wrapper around `queryClient.invalidateQueries({ queryKey })`.

## See Also

- Design spec: [`docs/superpowers/specs/2026-05-22-nestjs-inertia-plan-d-design.md`](../../docs/superpowers/specs/2026-05-22-nestjs-inertia-plan-d-design.md)
- Codegen (emits `api.ts`): [`packages/codegen/README.md`](../codegen/README.md)
- Implementation plan: [`docs/superpowers/plans/2026-05-22-nestjs-inertia-plan-d-client.md`](../../docs/superpowers/plans/2026-05-22-nestjs-inertia-plan-d-client.md)

## License

MIT
