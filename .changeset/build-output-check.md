---
"@dudousxd/nestjs-inertia-cli": patch
"@dudousxd/nestjs-inertia-client": patch
"@dudousxd/nestjs-inertia-codegen-extension": patch
"@dudousxd/nestjs-inertia": patch
"@dudousxd/nestjs-inertia-testing": patch
"@dudousxd/nestjs-inertia-vite": patch
---

Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. `tsc` builds no longer use a `.tsbuildinfo` that can outlive `dist/` and skip emitting files. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.
