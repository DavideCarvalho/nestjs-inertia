---
name: inertia-prop-markers
description: >-
  Control how page props are resolved across full and partial Inertia reloads
  with @dudousxd/nestjs-inertia prop markers: Inertia.always, Inertia.optional
  (lazy), Inertia.defer, Inertia.merge, Inertia.once, Inertia.scroll, plus
  InertiaService.share for shared props and nested-object marker resolution.
  Use when deferring expensive props, sharing auth/flash props, building
  infinite-scroll or merge-paginated lists, or optimizing partial reloads.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia"
  library_version: 1.8.0
  framework: nestjs
---

# Inertia prop markers

Page props returned from a handler are plain JSON by default. Wrap a prop in an
`Inertia.*` marker to change WHEN and HOW its value is resolved across full
visits and partial reloads. Markers take a **factory function** (`() => value`)
that the server calls lazily — never the value itself.

## Setup

Markers live on the `Inertia` export from the core package:

```ts
import { Inertia } from '@dudousxd/nestjs-inertia';
```

`Inertia(component)` is also the render decorator, but its namespace methods
(`Inertia.always`, `Inertia.optional`, `Inertia.defer`, `Inertia.merge`,
`Inertia.once`, `Inertia.scroll`) are the prop markers. Return them inside the
props object:

```ts
@Get('/dashboard')
@Inertia('Dashboard')
show() {
  return {
    user: Inertia.always(() => this.auth.current()),     // every render
    stats: Inertia.optional(() => this.heavyStats()),    // only when requested
    feed: Inertia.defer(() => this.activity(), 'sidebar'),// second roundtrip
  };
}
```

## Core patterns

### 1. always / optional — controlling partial-reload resolution

On a partial reload the client sends `X-Inertia-Partial-Data` listing the prop
keys it wants. Markers honour that list:

```ts
return {
  user: Inertia.always(() => current()),    // resolved even if not in the keep list
  charts: Inertia.optional(() => slow()),   // resolved ONLY when listed in the keep list
};
```

- `always` resolves on every render including partial reloads.
- `optional` (alias `lazy`, deprecated) is omitted from the first/full visit and
  resolved only when its key appears in `X-Inertia-Partial-Data`.

`Source: packages/core/src/service.ts (kind === 'always' / 'optional'), packages/core/src/markers.ts`

### 2. defer — second-roundtrip props

```ts
return {
  comments: Inertia.defer(() => this.loadComments(), 'secondary'),
  // rescue: catch a failing deferred prop instead of failing the whole reload
  risky: Inertia.defer(() => this.maybeThrows(), { group: 'secondary', rescue: true }),
};
```

On the FIRST visit a deferred prop is omitted from `props` and its key is listed
under `page.deferredProps[group]`; the Inertia client then fires a follow-up
partial reload that resolves it. With `{ rescue: true }`, a rejection on that
follow-up is caught — the prop is dropped and its path reported under
`page.rescuedProps` instead of throwing. `Source: packages/core/src/markers.ts (defer), packages/core/src/service.ts (kind === 'defer')`

### 3. merge / once / scroll — pagination, caching, infinite scroll

```ts
return {
  // merge: client appends/replaces instead of overwriting; matchOn de-dupes by id
  rows: Inertia.merge(() => this.page(p), { matchOn: 'id', deep: false }),
  // once: resolved on first visit, cached client-side; client sends
  //       X-Inertia-Except-Once-Props for keys it already holds fresh
  config: Inertia.once(() => this.buildConfig(), { key: 'app-config' }),
  // scroll: infinite-scroll paginated value { data: [...], ...cursor }
  posts: Inertia.scroll(() => this.paginate(cursor), { pageName: 'page', matchOn: 'id' }),
};
```

`Source: packages/core/src/markers.ts (merge/once/scroll), packages/core/src/service.ts`

## Common mistakes

### Mistake 1: passing the value instead of a factory

```ts
// Wrong: defer() expects a function — this resolves eagerly and defeats deferral
return { feed: Inertia.defer(await this.activity()) };
```

```ts
// Correct: pass a thunk so the server resolves it lazily (or on the follow-up reload)
return { feed: Inertia.defer(() => this.activity()) };
```

Mechanism: every marker stores `value: () => T | Promise<T>` and only invokes it
when the prop is actually selected for that response.
`Source: packages/core/src/markers.ts (make<T>(kind, value))`

### Mistake 2: expecting a deferred prop in the first response

```ts
// Wrong: reading props.feed on the initial page load — it is NOT there yet
// (it only appears after the client's automatic follow-up partial reload)
```

```ts
// Correct: render it through the client's <Deferred> fallback; the value arrives
// on the second roundtrip. The first response only announces page.deferredProps.
return { feed: Inertia.defer(() => this.activity(), 'sidebar') };
```

Mechanism: on a full visit a `defer` marker pushes its key to `deferredProps`
and returns nothing for that key; the value ships on the follow-up reload.
`Source: packages/core/src/service.ts (kind === 'defer', full reload branch)`

### Mistake 3: using merge metadata on a nested prop and expecting merge headers

```ts
// Wrong: assuming nested merge() emits mergeProps for "user.rows" — it cannot
return { user: { rows: Inertia.merge(() => rows()) } };
```

```ts
// Correct: merge/scroll metadata addresses TOP-LEVEL prop keys only
return { rows: Inertia.merge(() => rows(), { matchOn: 'id' }) };
```

Mechanism: the `X-Inertia` merge headers reference top-level keys, so a nested
`merge()` resolves its value but carries no merge metadata by design.
`Source: packages/core/src/service.ts (resolveMarker, kind === 'merge' nested branch comment)`
