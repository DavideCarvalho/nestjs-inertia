---
name: inertia-typed-link
description: >-
  Typed React navigation and forms for @dudousxd/nestjs-inertia-client. Covers
  wrapping the app in InertiaRouteProvider with the generated route() resolver,
  the typed <Link route= routeParams= query=> component (with optional TanStack
  prefetch on hover), the typed useForm wrapper over @inertiajs/react, useTypedReload,
  and the /react vs /vue vs /svelte subpaths. Use when rendering typed links,
  navigating by route name, or building typed Inertia forms in a page component.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia-client"
  library_version: 2.2.0
  framework: react
---

# Inertia typed links & forms (React)

The client package ships framework `<Link>` components and form hooks that
consume the codegen's `route()` resolver, so you navigate by **route name +
params** instead of hand-built URLs. React lives under the `/react` subpath
(`/vue` and `/svelte` mirror it).

## Setup

```bash
pnpm add @dudousxd/nestjs-inertia-client @inertiajs/react
```

Wrap your app once with `InertiaRouteProvider`, passing the generated `route`:

```tsx
// entry: app/client.tsx
import { InertiaRouteProvider } from '@dudousxd/nestjs-inertia-client/react';
import { route } from './.nestjs-inertia/routes.js';

createInertiaApp({
  setup({ el, App, props }) {
    createRoot(el).render(
      <InertiaRouteProvider routes={route} headers={() => ({ authorization: token() })}>
        <App {...props} />
      </InertiaRouteProvider>,
    );
  },
});
```

The optional `headers` callback is installed as the fetcher's global headers for
the provider's lifetime. `Source: packages/client/src/react/provider.tsx`

## Core patterns

### 1. Typed `<Link>`

```tsx
import { Link } from '@dudousxd/nestjs-inertia-client/react';

// no params:
<Link route="users.list">All users</Link>

// with params + query:
<Link route="users.show" routeParams={{ id: '42' }} query={{ tab: 'profile' }}>
  View user
</Link>
```

`route` is keyed by your generated route names; `routeParams` is REQUIRED (and
typed) when the route has params, and disallowed otherwise. The component
resolves `href` from the provider's `route()` — you never pass `href` yourself.
`Source: packages/client/src/react/link.tsx (LinkProps)`

### 2. Prefetch on hover with TanStack Query

```tsx
import { api } from './.nestjs-inertia/api';

<Link
  route="users.show"
  routeParams={{ id: '42' }}
  prefetch={api.users.show.queryOptions({ id: '42' })}
  queryClient={queryClient}
>
  View user
</Link>
```

On first `mouseenter` the Link calls `queryClient.prefetchQuery(prefetch)` once.
`Source: packages/client/src/react/link.tsx (handleMouseEnter)`

### 3. Typed useForm

```tsx
import { useForm } from '@dudousxd/nestjs-inertia-client/react';

const form = useForm({ email: '', password: '' });
form.errors.email;   // string | undefined (typed by the field keys)
form.post('/auth/login');
```

This is a thin TYPE layer over `@inertiajs/react`'s `useForm`; at runtime it
delegates verbatim, so precognition, `transform`, progress, etc. all work. The
server's flat, field-keyed error bag (`items.0.qty`) lines up byte-for-byte with
the typed `errors`. `Source: packages/client/src/react/use-typed-form.ts`

## Common mistakes

### Mistake 1: rendering a typed Link outside the provider

```tsx
// Wrong: no <InertiaRouteProvider> ancestor → useInertiaRoutes throws
<Link route="users.list">Users</Link>
```

```tsx
// Correct: wrap the app once at the entry with the generated route resolver
<InertiaRouteProvider routes={route}><App /></InertiaRouteProvider>
```

Mechanism: `<Link>` calls `useInertiaRoutes()`, which throws a descriptive error
when the route context is missing. `Source: packages/client/src/react/provider.tsx (useInertiaRoutes)`

### Mistake 2: passing href instead of route to the typed Link

```tsx
// Wrong: href is Omit-ted from the typed Link's props; route/routeParams drive it
<Link href="/users/42">User</Link>
```

```tsx
// Correct: navigate by route name; href is resolved internally
<Link route="users.show" routeParams={{ id: '42' }}>User</Link>
```

Mechanism: `LinkProps` is `Omit<ComponentProps<InertiaLink>, 'href'>` plus
`route`; the component computes `href` from `resolveRoute(route, routeParams, query)`.
`Source: packages/client/src/react/link.tsx`

### Mistake 3: importing Link from the package root

```tsx
// Wrong: framework components are not on the root export
import { Link } from '@dudousxd/nestjs-inertia-client';
```

```tsx
// Correct: use the framework subpath (/react, /vue, or /svelte)
import { Link } from '@dudousxd/nestjs-inertia-client/react';
```

Mechanism: the root `index.ts` exports only browser-safe fetch/contract helpers;
React components are exported from `react/index.ts` under the `/react` subpath.
`Source: packages/client/src/index.ts, packages/client/src/react/index.ts`
