---
name: inertia-typed-client
description: >-
  Tuyau-style typed HTTP client for @dudousxd/nestjs-inertia-client. Covers
  defineContract (zod query/body/response/params), server route naming with @As,
  @ApplyContract({ validate: true }) + ContractValidationPipe for runtime
  validation, createFetcher (get/post/put/patch/delete/sse, baseUrl, headers,
  onError), setGlobalHeaders, ApiHttpError, buildUrl, and consuming the generated
  api.ts queryOptions/mutationOptions/queryKey with TanStack Query. Use when
  defining contracts, naming routes, or calling endpoints from the browser.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia-client"
  library_version: 2.2.0
  framework: nestjs
---

# Inertia typed HTTP client

`@dudousxd/nestjs-inertia-client` pairs a server-side contract (`defineContract`
+ `@As` + `@ApplyContract`) with a browser-side typed fetch (`createFetcher`).
The codegen reads your contracts and emits `.nestjs-inertia/api.ts` with
`queryOptions()` / `mutationOptions()` / `queryKey()` for every endpoint, plus a
`route()` resolver in `routes.ts`.

## Setup

```bash
pnpm add @dudousxd/nestjs-inertia-client zod
```

Server entry points live under the `/server` subpath; browser fetch utilities at
the package root:

```ts
// server — contract + route naming + optional runtime validation
import { As, ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { defineContract } from '@dudousxd/nestjs-inertia-client';

// browser — typed fetch
import { createFetcher, setGlobalHeaders, ApiHttpError } from '@dudousxd/nestjs-inertia-client';
```

## Core patterns

### 1. Define a contract and apply it to a handler

```ts
// users.contract.ts
import { z } from 'zod';
import { defineContract } from '@dudousxd/nestjs-inertia-client';

export const CreateUser = defineContract({
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: z.object({ id: z.string(), name: z.string() }),
});
```

```ts
// users.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { As, ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { CreateUser } from './users.contract';

@Controller('/api/v1/users')
@As('users')                                  // class portion of the route name
export class UsersController {
  @Post()
  @ApplyContract(CreateUser, { validate: true })  // → route 'users.create'
  create(@Body() body: { name: string; email: string }) {
    return { id: '1', name: body.name };
  }
}
```

`@As` overrides the auto-derived route name; the final name is
`${classPortion}.${methodPortion}` (here `users` + method name). Each segment is
validated against `/^[a-z][a-zA-Z0-9]*$/`.
`Source: packages/client/src/contract/as.decorator.ts, packages/client/src/contract/apply-contract.decorator.ts`

### 2. createFetcher — the typed browser client

```ts
const fetcher = createFetcher({
  baseUrl: '/api/v1',
  headers: () => ({ authorization: `Bearer ${getToken()}` }), // called per request
  onError: (err) => reportError(err),
});

const user = await fetcher.post<{ id: string }>('/users', {
  body: { name: 'Alice', email: 'alice@example.com' },
});
```

`FormData` bodies are sent as-is (no `content-type` forced, so the multipart
boundary survives); everything else is JSON-stringified with
`content-type: application/json`. A non-2xx response throws `ApiHttpError`;
`204` returns `undefined`. `fetcher.sse<T>(path)` consumes a NestJS `@Sse()`
endpoint as a typed async iterable. `Source: packages/client/src/fetcher/fetcher.ts`

### 3. Generated api.ts with TanStack Query

The codegen output drives queries/mutations directly:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~codegen/api';

const { data } = useQuery(api.users.list.queryOptions());
const create = useMutation(api.users.create.mutationOptions());
await create.mutateAsync({ name: 'Alice', email: 'alice@example.com' });

const qc = useQueryClient();
qc.invalidateQueries({ queryKey: api.users.list.queryKey() });
```

`Source: packages/client/README.md`

## Common mistakes

### Mistake 1: expecting runtime validation without opting in

```ts
// Wrong: contract schemas are read at codegen-time only — no runtime check here
@Post() @ApplyContract(CreateUser) create(@Body() b: unknown) { /* b unvalidated */ }
```

```ts
// Correct: opt in so a ContractValidationPipe enforces body/query at runtime
@Post() @ApplyContract(CreateUser, { validate: true }) create(@Body() b: CreateUserBody) {}
```

Mechanism: `ApplyContract` only adds `UsePipes(new ContractValidationPipe(c))`
when `opts.validate` is true; the default `false` keeps pre-v0.9 behaviour.
`Source: packages/client/src/contract/apply-contract.decorator.ts`

### Mistake 2: importing server decorators from the package root

```ts
// Wrong: As/ApplyContract are NOT exported from the package root
import { As } from '@dudousxd/nestjs-inertia-client';
```

```ts
// Correct: NestJS server decorators live under the /server subpath
import { As, ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
```

Mechanism: the root `index.ts` exports browser-safe fetch/contract helpers only;
server-only decorators are re-exported from `server/index.ts`.
`Source: packages/client/src/index.ts, packages/client/src/server/index.ts`

### Mistake 3: calling createFetcher with no fetch in a non-browser runtime

```ts
// Wrong: in Node without a global fetch this throws at request time
const f = createFetcher({ baseUrl: '/api' });
await f.get('/x'); // Error: No fetch implementation
```

```ts
// Correct: inject a fetch (Node <18, tests, custom runtime)
const f = createFetcher({ baseUrl: '/api', fetch: nodeFetch });
```

Mechanism: the fetcher uses `opts.fetch ?? globalThis.fetch` and throws an
explicit error when neither is present. `Source: packages/client/src/fetcher/fetcher.ts (request)`
