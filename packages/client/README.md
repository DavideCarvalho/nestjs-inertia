# @dudousxd/nestjs-inertia-client

> Typed HTTP client, `@As` route naming, `<Link>` components for React/Vue/Svelte, and SSR hydration.

[![npm version](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-client)](https://www.npmjs.com/package/@dudousxd/nestjs-inertia-client)

## Install

```bash
pnpm add @dudousxd/nestjs-inertia-client
```

## What it does

The codegen emits `.nestjs-inertia/api.ts` with `queryOptions()`, `mutationOptions()`, and `queryKey()` for every controller endpoint. This package provides:

- `@As(name)` to override auto-derived route names
- `createFetcher()` for a typed fetch client
- Typed `<Link>` components for React, Vue 3, and Svelte
- SSR hydration helpers for TanStack Query

## Usage

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~codegen/api';

// Queries
const { data } = useQuery(api.users.list.queryOptions());

// Mutations
const create = useMutation(api.users.create.mutationOptions());
await create.mutateAsync({ name: 'Alice', email: 'alice@example.com' });

// Cache invalidation
const qc = useQueryClient();
qc.invalidateQueries({ queryKey: api.users.list.queryKey() });
```

## Typed `<Link>`

```tsx
import { Link } from '@dudousxd/nestjs-inertia-client/react';

<Link route="users.show" routeParams={{ id: '42' }}>View user</Link>
```

Also available as `/vue` and `/svelte` subpaths.

## Docs

Full documentation: **https://davidecarvalho.github.io/nestjs-inertia/guides/typed-client/**

## License

MIT
