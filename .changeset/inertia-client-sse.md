---
"@dudousxd/nestjs-inertia-client": patch
---

feat: `createFetcher` now implements `sse()` to satisfy the codegen `Fetcher` contract (SSE/@Sse() endpoints), fixing `createApi(fetcher)` typecheck against generated Inertia APIs.
