---
"@dudousxd/nestjs-inertia-client": minor
---

Add the `useInertiaForm` React hook on a new `./react-form` subpath. One call
wraps react-hook-form + `zodResolver(schema)` + an Inertia `router` submit, with
automatic server-error merge into RHF state (scoped by `errorBag`), `formError`
aggregation for non-field/`_` keys, `isSubmitting`, and `resetOnSuccess`.
`react-hook-form` and `@hookform/resolvers` are optional peers reachable only
through `./react-form` — base `./` and `./react` bundles never pull them. Ships a
framework-free `mergeServerErrors` helper (shared seam for Vue/Svelte recipes).
