# @dudousxd/nestjs-inertia-cli

Onboarding CLI for [`@dudousxd/nestjs-inertia`](https://davidecarvalho.github.io/nestjs-inertia/).

```bash
pnpm add -D @dudousxd/nestjs-inertia-cli

pnpm exec nestjs-inertia init      # scaffold shell, Vite entry, shared codegen config
pnpm exec nestjs-inertia doctor    # diagnose setup pitfalls
```

## `init`

Detects your frontend framework (React / Vue 3 / Svelte 5) from `package.json` and scaffolds
the current recommended setup:

- `inertia/index.html` — root view shell with `@inertia` / `@inertiaHead` / `@vite` directives
- `inertia/app.tsx` (or `.ts`) — `createInertiaApp` Vite entry
- `nestjs-codegen.config.ts` — shared codegen config with `nestjsInertiaCodegen()` registered,
  written as ONE exported object so the CLI and `NestjsCodegenModule.forRoot` never drift
- `nestjs-inertia.d.ts` — stub for handwritten registry augmentations
- `vite.config.ts` — `nestInertia` plugin + `@` / `~` / `~codegen` aliases
- `.gitignore` — appends `.nestjs-inertia/`

It then prints the manual wiring: the `InertiaModule.forRoot({ ..., codegen: { enabled: false } })`
registration snippet, the `setupInertiaVite` bootstrap, and the codegen scripts.

Idempotent: existing files are never overwritten without `--force`. Use `--dry-run` to preview,
`--framework react|vue|svelte` to override detection.

## `doctor`

Checks the known pitfalls, each with a pass/warn/fail line and a docs pointer:

- `InertiaModule` registered (module entry resolved from the codegen config)
- legacy auto-watch disabled (`codegen: { enabled: false }`)
- codegen configured, `nestjsInertiaCodegen()` registered, and no CLI/module config drift
- root view shell + Vite entry + `nestInertia` plugin present
- Vite client manifest exists after a build (`dist/inertia/client/.vite/manifest.json`)
- `@dudousxd/nestjs-inertia >= 1.4.4` (streaming-response fix)
- registry `.d.ts` uses the current flat `InertiaPages` shape (not nested `InertiaRegistry.pages`)
- peer coherence: codegen + extension pair, Inertia adapter v3+, no legacy codegen package
- `.gitignore` covers `.nestjs-inertia/`

Exits `1` when any check fails.
