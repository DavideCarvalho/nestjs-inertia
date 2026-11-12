---
"@dudousxd/nestjs-inertia": major
"@dudousxd/nestjs-inertia-client": major
"@dudousxd/nestjs-inertia-testing": major
"@dudousxd/nestjs-inertia-vite": major
"@dudousxd/nestjs-inertia-cli": minor
"@dudousxd/nestjs-inertia-codegen-extension": minor
---

**Breaking:** require Node.js 24 or newer (`engines.node` is now `>=24`, was `>=20`; `@dudousxd/nestjs-inertia-cli` declares it for the first time). CI tests on Node 24 and 26.

Also removed (see the Upgrading page in the docs):

- `@dudousxd/nestjs-inertia`: `Inertia.lazy()`, the deprecated alias of `Inertia.optional()`. Rename the calls.
- `@dudousxd/nestjs-inertia`: the `codegen` option of `InertiaModule.forRoot()` (and its `CodegenOptions` type and the `NESTJS_INERTIA_DISABLE_AUTO_CODEGEN` variable). It auto-started the deleted legacy `@dudousxd/nestjs-inertia-codegen` watcher. Delete `codegen: { enabled: false }` from your module; run `nestjs-codegen --watch`, or register `NestjsCodegenModule.forRoot(...)` from `@dudousxd/nestjs-codegen/nest` to watch from the app.
- `@dudousxd/nestjs-inertia-cli`: `doctor` no longer checks for `codegen: { enabled: false }`, and `init` no longer prints it.
