---
"@dudousxd/nestjs-inertia-codegen": patch
---

Resolve `@Filterable` entities imported from node_modules packages.

`resolveModuleSpecifier` only handled relative imports and tsconfig path aliases, so an `@ApplyFilter` whose filter's `@Filterable({ entity: X })` referenced an entity published in a dependency (rather than declared in `src/`) failed to resolve. The endpoint was then mis-emitted as a non-filter route — `body: never`, no `.filterQuery()` builder — and the generated client POSTed an empty body, silently dropping the consumer's filter/sort/pagination.

Bare package specifiers now resolve to their declaration files: a new `resolveBarePackageTypes` walks `node_modules` upward from the importing file, reads the package's `package.json` (`exports` conditions, then top-level `types`/`typings`), and falls back to conventional layouts (`<sub>.d.ts`, `dist/index.d.ts`). The package directory is located on disk rather than via `require.resolve('<pkg>/package.json')`, which `exports` encapsulation otherwise blocks.
