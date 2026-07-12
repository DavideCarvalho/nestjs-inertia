# @dudousxd/nestjs-inertia-cli

## 0.1.0

### Minor Changes

- [`1009360`](https://github.com/DavideCarvalho/nestjs-inertia/commit/1009360d8426806858397a59929b91d23dc154b9) - New onboarding CLI (`nestjs-inertia` bin), replacing the one deleted with the legacy codegen package. `init` scaffolds the current flow — root view shell, Vite entry, shared `nestjs-codegen.config.ts` with `nestjsInertiaCodegen()`, registry `.d.ts` stub — idempotently (`--force` to overwrite, `--dry-run` to preview) and prints the `InertiaModule.forRoot({ codegen: { enabled: false } })` + `setupInertiaVite` wiring. `doctor` diagnoses the known pitfalls (module registration, legacy auto-watch, CLI/module codegen config drift, Vite manifest post-build, core >= 1.4.4 streaming fix, flat registry shape, peer coherence) with pass/warn/fail and docs pointers.
