# Contributing guide

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor guide covering setup, TDD discipline, Conventional Commits, the Changesets release flow, and the PR process.

## Internal architecture notes

A few nuances worth knowing before diving into the code:

- **No `emitDecoratorMetadata`** — the lib packages use vitest + esbuild which does not support `emitDecoratorMetadata`. All dependency injection uses explicit `@Inject(TOKEN)` tokens rather than relying on TypeScript's design-time metadata. The example app (`examples/express-react/`) is the one place where `reflect-metadata` is imported at runtime because it boots a real NestJS application.

- **Workspace links** — internal cross-package dependencies always use `workspace:*`. Never paste version strings.

- **codegen ↔ client coupling** — `codegen` reads `@ApplyContract` metadata attached by `client`. The two packages must stay in sync: if you add a new contract option in `client`, update the codegen analyser and the generated `api.ts` shape to match.

- **core interceptor vs. decorator** — `@Inertia()` is a method decorator that registers an NestJS interceptor under the hood. If you need to extend how responses are serialised, the extension point is `InertiaInterceptor`, not the decorator itself.
