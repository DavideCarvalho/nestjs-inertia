---
"@dudousxd/nestjs-inertia-codegen": minor
---

Add `Route.FilterFields<K>` / `Path.FilterFields<M, U>` type helpers.

Each `ApiRouter` leaf now carries a `filterFields` member — the string-literal
union of a route's filterable fields when it uses `@dudousxd/nestjs-filter`
(`@ApplyFilter` + a `@Filterable` class), or `never` otherwise. The new
`Route.FilterFields<'pipelineRuns.search'>` helper resolves that union by route
name (and `Path.FilterFields<'POST', '/api/...'>` by method+url), mirroring the
existing `Route.Response`/`Body`/`Query`/`Params`/`Error` helpers.

This replaces the awkward
`Parameters<ReturnType<typeof api.x.y.filterQuery>['where']>[0]` trick callers
were using to recover the field union for things like validating dynamic
data-grid column ids before handing them to the builder.

The helper is purely type-level: the `filterFields` union is baked into the
generated `ApiRouter`, so it does **not** require `@dudousxd/nestjs-filter` (or
its client) to be installed. Routes without a filter simply resolve to `never`.
