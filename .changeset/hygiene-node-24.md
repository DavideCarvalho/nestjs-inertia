---
"@dudousxd/nestjs-inertia": patch
"@dudousxd/nestjs-inertia-client": patch
"@dudousxd/nestjs-inertia-testing": patch
"@dudousxd/nestjs-inertia-vite": patch
"@dudousxd/nestjs-inertia-cli": minor
"@dudousxd/nestjs-inertia-codegen-extension": minor
---

**Breaking:** require Node.js 24 or newer (`engines.node` is now `>=24`, was `>=20`; `@dudousxd/nestjs-inertia-cli` declares it for the first time). CI tests on Node 24 and 26.

Also removed (see the Upgrading page in the docs):

- `@dudousxd/nestjs-inertia`: `Inertia.lazy()`, the deprecated alias of `Inertia.optional()`. Rename the calls.
- `@dudousxd/nestjs-inertia`: the `codegen` option of `InertiaModule.forRoot()` (and its `CodegenOptions` type and the `NESTJS_INERTIA_DISABLE_AUTO_CODEGEN` variable). It auto-started the deleted legacy `@dudousxd/nestjs-inertia-codegen` watcher. Delete `codegen: { enabled: false }` from your module; run `nestjs-codegen --watch`, or register `NestjsCodegenModule.forRoot(...)` from `@dudousxd/nestjs-codegen/nest` to watch from the app.
- `@dudousxd/nestjs-inertia-cli`: `doctor` no longer checks for `codegen: { enabled: false }`, and `init` no longer prints it.

> Released as **3.0.1**: `2.0.0`, `2.0.1` and `3.0.0` of these packages exist on npm from accidental publishes, so this major (Node 24+) ships one patch past them.
