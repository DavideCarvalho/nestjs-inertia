# @dudousxd/nestjs-inertia-client

Tuyau-style typed HTTP client for `@dudousxd/nestjs-inertia`, built on TanStack Query v5 core.

[![npm version](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-client)](https://www.npmjs.com/package/@dudousxd/nestjs-inertia-client)

> Alpha — in active development. API may change before 1.0.

## Install

```bash
pnpm add @dudousxd/nestjs-inertia-client @tanstack/query-core zod
```

## Quick Start

### 1. Define a Contract

```ts
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { z } from 'zod';

export const listUsersContract = defineContract({
  name: 'users.list',
  query: z.object({ page: z.number().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const createUserContract = defineContract({
  name: 'users.create',
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: z.object({ id: z.string(), name: z.string() }),
});
```

Contracts carry **no** `method` or `path` — routing is the responsibility of NestJS decorators.

### 2. Name your Contract

The `name` field controls how the generated `api.ts` exposes the endpoint — it is **not** derived from the controller or method name. Use dot-notation to nest under `api.*.*`:

- `'users.list'` → `api.users.list.queryOptions(...)`
- `'health'` → `api.health.queryOptions(...)`

Best practice: align names with your resource hierarchy (`'users.list'`, `'users.show'`, `'users.create'`) so the generated `api` object mirrors your domain model.

### 3. Bind a Contract to a NestJS Handler with `@ApplyContract`

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

`@ApplyContract` only attaches the contract metadata (`CONTRACT_METADATA`) — it does **not** set the NestJS routing path or HTTP method. Always pair it with a NestJS HTTP verb decorator (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`). `@dudousxd/nestjs-inertia-codegen` reads both the verb decorator and the contract to emit a typed `api.ts`.

### 4. Create a Fetcher and Call Endpoints

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

### 5. Handle Errors

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

## Type helpers (generated `api.ts`)

The generated `api.ts` exports `Route.*` and `Path.*` namespaces for compile-time access to request/response shapes:

```ts
import type { Route, Path } from '.nestjs-inertia/api.js';

// by contract name
type UserList = Route.Response<'users.list'>;
type CreateReq = Route.Request<'users.create'>;
// → { body: ...; query: ...; params: ... }

// by HTTP method + URL
type ListResp = Path.Response<'GET', '/api/users'>;
type CreateBody = Path.Body<'POST', '/api/users'>;
```

The existing `InferResponse<K>`, `InferBody<K>`, `InferQuery<K>` exports are preserved as aliases to `Route.Response`, `Route.Body`, `Route.Query`.

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

### `defineContract(def)`

Creates a typed contract definition. Accepts:

| Field | Required | Description |
|---|---|---|
| `name` | yes | Dot-separated name used as the `api.*` key |
| `response` | yes | Zod schema for the response body |
| `query` | no | Zod schema for URL query parameters |
| `body` | no | Zod schema for the request body |
| `params` | no | Zod schema for path parameters |
| `error` | no | Zod schema for error responses |

No `method` or `path` — those come from NestJS decorators.

### `@ApplyContract(contractDef, opts?)`

NestJS method decorator. Attaches the contract to the handler via `Reflect` metadata under `CONTRACT_METADATA`. Does **not** set HTTP method or path — always combine with `@Get`, `@Post`, etc.

Options:

| Option | Default | Description |
|---|---|---|
| `validate` | `false` | When `true`, installs a `ContractValidationPipe` that validates `body` and `query` against Zod schemas at runtime |

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
