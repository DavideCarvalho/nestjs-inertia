---
'@dudousxd/nestjs-inertia': patch
---

Render path performance and serialization fixes:

- Props are no longer rebuilt key by key: one synchronous scan looks for nested markers, and a prop with none (and no partial-reload sub-path filter) is sent as is. The scan descends only into arrays and plain objects, so `Date`, `Map`, `Set` and class instances with a `toJSON` (Decimal, Luxon, ORM entities) now serialize as `JSON.stringify` would instead of turning into `{}` or plain copies. `undefined`-to-`null` conversion also leaves objects with a `toJSON` alone.
- Root-view directives are expanded in a single pass over the template, so page props or SSR markup containing `@inertia`, `@vite(...)`, `@asset(...)` or `@inertiaHead` are no longer rewritten (or fail the request with "manifest entry not found"). Template-engine root views expand the directives written in the template itself, never text the engine interpolated.
- With diagnostics subscribed, an Inertia XHR response serializes the page once and measures `pageBytes` on the string it sends (Express with default JSON settings).
- `req.inertia` is created on first use, so requests that never render no longer build an `InertiaService`.
