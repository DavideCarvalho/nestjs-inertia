---
"@dudousxd/nestjs-inertia-client": minor
---

Add opt-in superjson runtime integration — the runtime complement to the codegen `serialization: 'superjson'` option (which already emits rich types, e.g. `Date` stays `Date`).

`superjson` is an **optional** peer dependency: all superjson imports are isolated behind a dedicated `@dudousxd/nestjs-inertia-client/superjson` subpath, so plain-JSON consumers never load it.

- **Fetcher `deserialize` hook** — `FetcherOptions` gains a serialization-agnostic `deserialize?: (raw: unknown) => unknown`, applied to the parsed body of `application/json` responses only (not the text fallback or SSE). Default is identity, so existing consumers are unaffected.
- **`/superjson` subpath** exports `superjsonFetcherOptions()` (and a `withSuperjson(opts)` merger) that supply `superjson.deserialize` plus the `x-superjson: 1` opt-in request header — `createFetcher({ baseUrl, ...superjsonFetcherOptions() })`.
- **`SuperjsonInterceptor`** (NestJS `NestInterceptor`) maps responses through `superjson.serialize(...)` (the `{ json, meta }` envelope) **only** when the request carries `x-superjson: 1`; otherwise it passes the response through untouched.

Content-negotiated via the `x-superjson` header so each consumer (flip-frontend, the codegen client, etc.) can adopt superjson independently with no atomic cross-app flip — superjson never breaks a plain-JSON consumer.
