---
"@dudousxd/nestjs-inertia": minor
"@dudousxd/nestjs-inertia-client": minor
"@dudousxd/nestjs-inertia-codegen-extension": minor
"@dudousxd/nestjs-inertia-testing": minor
"@dudousxd/nestjs-inertia-vite": minor
---

A broad set of ecosystem improvements across the server adapter, typed client, codegen, testing, and Vite packages.

**Server (`@dudousxd/nestjs-inertia`)**

- General flash messages: the flash store now carries arbitrary flash payloads (success, info, warning, etc.) instead of being limited to errors.
- Stable asset-version fallback: the asset-version provider derives a deterministic fallback version so SSR/CSR markup stays consistent when no explicit version is configured.
- `matchOn: string | string[]`: partial-reload / scope matching accepts either a single key or an array of keys.
- `lazy()` deprecation: deprecated usages now emit a warning through the Nest `Logger` to guide migration.
- SSR streaming: streaming SSR render is supported on both the Express and Fastify adapters, with a retryable SSR loader that falls back to buffered SSR when streaming setup fails.
- Packaging hygiene: dual ESM/CJS `exports` maps and build config cleaned up across the package set.

**Client (`@dudousxd/nestjs-inertia-client`)**

- Typed `useForm` end-to-end for React, Vue, and Svelte.
- Typed `<Deferred>` / `<WhenVisible>` components with shared deferred types across frameworks.
- Native `router.poll` and prefetch helpers (typed poll + prefetch-route utilities).

**Codegen, testing, and Vite**

- Codegen extension, testing helpers (Jest + Vitest), and the Vite plugin updated to support the new typed client surface and packaging conventions.
