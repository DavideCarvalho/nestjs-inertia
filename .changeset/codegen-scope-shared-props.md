---
"@dudousxd/nestjs-inertia-codegen-extension": minor
---

`scopes` option: type each `InertiaModule.forFeature({ scope })` app's shared props.

`nestjsInertiaCodegen({ scopes: { admin: { shared: { module, export, kind } } } })` adds
`InertiaScopeSharedProps` (scope → its shared-props shape) and `ScopeSharedProps<S>` to
`shared.ts`, validated like `shared` (errors name `scopes.<scope>.shared`). Works with or
without the top-level `shared`; `default` is reserved. A test compiles `navigate()` and
`shared.ts` under `noUnusedLocals`, `noUnusedParameters` and `exactOptionalPropertyTypes`.
