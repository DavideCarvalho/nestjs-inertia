---
"@dudousxd/nestjs-inertia-codegen-extension": minor
---

Add opt-in `shared` and `pageExcludes` options to `nestjsInertiaCodegen()`.

- `shared: { module, export, kind }` emits `shared.ts` with a typed `InertiaSharedProps`
  re-export, sourced explicitly (no inference) from a named `function` or `type` export —
  useful since shared props are often registered per-request in middleware, not statically
  in `InertiaModule.forRoot()`. Throws with an actionable message if the module or export
  can't be found.
- `pageExcludes: true` scans the contracts glob for `@Inertia`-decorated, HTTP-method-decorated
  controller methods and emits `page-excludes.ts` — a framework-free `{ path, method }[]` list
  to feed `setGlobalPrefix('api', { exclude })`, replacing a hand-maintained (and
  bug-prone) exclude list. Throws if zero pages are found.

Calling `nestjsInertiaCodegen()` with no arguments is unchanged — no files are emitted, only
the existing `apiHeader` (`navigate()` helper) contribution runs.

Also bumps the `@dudousxd/nestjs-codegen` peer range to `>=0.2.1` (the earliest version
actually published to npm — `>=0.1.0` never resolved to a real release) and the dev
dependency to the latest published `0.13.2`.
