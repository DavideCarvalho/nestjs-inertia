---
"@dudousxd/nestjs-inertia": minor
"@dudousxd/nestjs-inertia-testing": minor
---

Complete Inertia.js v3 wire-protocol coverage on the server adapter, plus matching `expectInertia` matchers.

**Server (`@dudousxd/nestjs-inertia`)**

- **Once props aligned to the official protocol.** The client now reports already-cached once keys via the `X-Inertia-Except-Once-Props` header (server skips resolving those), and every once prop is announced under a new `onceProps` page-object field (`{ <cacheKey>: { prop, expiresAt } }`). `Inertia.once(fn, { key?, expiresAt? })` supports a stable cache key and an optional expiry. **Behaviour change:** the previous homegrown `X-Inertia-Reset-Once` header is no longer read — switch clients to `X-Inertia-Except-Once-Props`.
- **`prependProps`.** `Inertia.merge(fn, { prepend: true })` labels the prop in a new `prependProps` array (honours `matchOn` and `X-Inertia-Reset`).
- **`rescuedProps`.** `Inertia.defer(fn, { rescue: true })` catches a deferred resolver failure on the follow-up partial reload, omits the prop, and reports its path under `rescuedProps` instead of failing the request.
- **Infinite scroll.** `Inertia.scroll(fn, { pageName?, matchOn?, defer?, group? })` emits a `scrollProps` cursor (`{ pageName, currentPage, nextPage, previousPage, reset }`), labels `<path>.data` for merge/prepend per the `X-Inertia-Infinite-Scroll-Merge-Intent` header, and honours `X-Inertia-Reset`. Deferred scroll announces under `deferredProps` and emits the merge label on the first visit, deferring the cursor to the partial reload.
- **SSR hydration marker.** The server-rendered `#app` mount now carries `data-server-rendered="true"` (buffered and streaming), so the Inertia client hydrates instead of re-rendering.
- **Stricter shell escaping.** Every `/` in the embedded page JSON is escaped to `\/` per the protocol (in addition to `<`, `>`, `&`, U+2028/9).
- The render diagnostic now also carries `prepend`, `once`, `scroll`, `rescued`, and `partial.exceptOnce` (additive).

**Testing (`@dudousxd/nestjs-inertia-testing`)**

- New `expectInertia` matchers: `toHavePrependProp`, `toHaveOnceProp`, `toHaveScrollProp`, `toHaveRescuedProp`, and `toHaveMergeProp(name, { strategy: 'prepend' })`.
