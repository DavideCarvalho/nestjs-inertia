# @dudousxd/nestjs-inertia-cli

## 0.2.0

### Minor Changes

- [#103](https://github.com/DavideCarvalho/nestjs-inertia/pull/103) [`a56d050`](https://github.com/DavideCarvalho/nestjs-inertia/commit/a56d0506d952d05dd45cf5eb8c472181dfdfbecf) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking:** require Node.js 24 or newer (`engines.node` is now `>=24`, was `>=20`; `@dudousxd/nestjs-inertia-cli` declares it for the first time). CI tests on Node 24 and 26.

  Also removed (see the Upgrading page in the docs):

  - `@dudousxd/nestjs-inertia`: `Inertia.lazy()`, the deprecated alias of `Inertia.optional()`. Rename the calls.
  - `@dudousxd/nestjs-inertia`: the `codegen` option of `InertiaModule.forRoot()` (and its `CodegenOptions` type and the `NESTJS_INERTIA_DISABLE_AUTO_CODEGEN` variable). It auto-started the deleted legacy `@dudousxd/nestjs-inertia-codegen` watcher. Delete `codegen: { enabled: false }` from your module; run `nestjs-codegen --watch`, or register `NestjsCodegenModule.forRoot(...)` from `@dudousxd/nestjs-codegen/nest` to watch from the app.
  - `@dudousxd/nestjs-inertia-cli`: `doctor` no longer checks for `codegen: { enabled: false }`, and `init` no longer prints it.

  > Released as **3.0.1**: `2.0.0`, `2.0.1` and `3.0.0` of these packages exist on npm from accidental publishes, so this major (Node 24+) ships one patch past them.

## 0.1.1

### Patch Changes

- [#100](https://github.com/DavideCarvalho/nestjs-inertia/pull/100) [`098bb98`](https://github.com/DavideCarvalho/nestjs-inertia/commit/098bb98c559193267aefe38de9f96fa35e8e487d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. `tsc` builds no longer use a `.tsbuildinfo` that can outlive `dist/` and skip emitting files. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.1.0

### Minor Changes

- [`1009360`](https://github.com/DavideCarvalho/nestjs-inertia/commit/1009360d8426806858397a59929b91d23dc154b9) - New onboarding CLI (`nestjs-inertia` bin), replacing the one deleted with the legacy codegen package. `init` scaffolds the current flow — root view shell, Vite entry, shared `nestjs-codegen.config.ts` with `nestjsInertiaCodegen()`, registry `.d.ts` stub — idempotently (`--force` to overwrite, `--dry-run` to preview) and prints the `InertiaModule.forRoot({ codegen: { enabled: false } })` + `setupInertiaVite` wiring. `doctor` diagnoses the known pitfalls (module registration, legacy auto-watch, CLI/module codegen config drift, Vite manifest post-build, core >= 1.4.4 streaming fix, flat registry shape, peer coherence) with pass/warn/fail and docs pointers.
