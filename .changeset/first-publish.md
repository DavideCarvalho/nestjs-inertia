---
"@dudousxd/nestjs-inertia": minor
"@dudousxd/nestjs-inertia-vite": minor
"@dudousxd/nestjs-inertia-testing": minor
"@dudousxd/nestjs-inertia-codegen": minor
"@dudousxd/nestjs-inertia-client": minor
---

First public release — Inertia.js v3 adapter for NestJS.

- Core: InertiaModule.forRoot/forRootAsync/forFeature, @Inertia decorator, Inertia.optional/defer/merge/always markers, CSRF with tokenContext, SSR support, Express + Fastify adapters
- Vite: setupInertiaVite + nestInertia plugin, @inertia/@vite/@inertiaHead shell directives
- Codegen: nestjs-inertia init (full scaffold + auto-patch), auto-watch in dev, static AST discovery, class-validator DTO support, Route/Path type helpers, @As hierarchical naming
- Client: defineContract + @ApplyContract, typed Link for React/Vue/Svelte with context providers, createFetcher, SSR hydration, rich error messages
- Testing: expectInertia matchers, assertInertia, InertiaTestingModule, fakes
