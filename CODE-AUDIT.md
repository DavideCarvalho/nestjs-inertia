# NestJS Inertia — Code & Architecture Audit

Audit scope: `0.9.0-alpha.0`, 5 published packages + website + 3 examples. 503 unit/integration `it()` calls across 76 spec files; 3 example E2E specs.

This is a read-only audit. Findings are concrete (file:line) so the team can act without re-discovery.

---

## 1. Top 10 issues to fix (impact ÷ effort)

1. **`pnpm nestjs-inertia codegen` one-shot mode never emits `routes.ts` or `api.ts`.** **HIGH.**
   `packages/codegen/src/cli/codegen.ts:23` calls `generate(config)` with no routes, and `generate()` (`packages/codegen/src/generate.ts:33`) only emits routes when `routes.length > 0`. Route discovery is gated inside `watch()` — the CLI without `--watch` cannot produce route artifacts. Fix: in `runCodegen`, when `--watch` is false, call `discoverContractsFast(...)` (or heavy probe if `useStaticDiscovery: false`) and pass the result into `generate(config, routes)`.

2. **Published codegen tarball is missing `tsconfig.probe.json`.** **HIGH.**
   `packages/codegen/src/discovery/routes.ts:52` resolves `<pkg>/tsconfig.probe.json` from `dist/discovery/..` but `packages/codegen/package.json:24` `"files"` lists only `["dist","bin","README.md","CHANGELOG.md"]`. Result: when a user installs from npm and falls back to the heavy probe path (`useStaticDiscovery: false`), it throws at runtime. Fix: either add `"tsconfig.probe.json"` to `files`, or copy it to `dist/` in the build script.

3. **`setRouteResolver` is documented as importable from the main entry but isn't exported there.** **HIGH.**
   `website/src/content/docs/guides/typed-link.mdx:39` and `packages/client/README.md` show `import { setRouteResolver } from '@dudousxd/nestjs-inertia-client'`. The main `packages/client/src/index.ts` does NOT export it — only the `/react`, `/vue`, `/svelte` subpaths do. Users following the docs get a runtime error. Fix one or the other (preferably re-export from `client/src/index.ts:13` so docs are correct and framework-agnostic call sites work).

4. **CLI `--version` output is stale.** **MEDIUM-LOW (very easy).**
   `packages/codegen/src/cli/main.ts:29` hardcodes `cli.version('0.4.0-alpha.0')` while the package is at `0.9.0-alpha.0`. Fix: import `VERSION` from `../index.js` and use it.

5. **Three READMEs reference outdated versions.** **MEDIUM (trivial).**
   - `packages/core/README.md:8` says `Status: 0.3.0-alpha`.
   - `packages/client/README.md:7` says `v0.6.0-alpha.0`.
   - `README.md:7`,`13-17`,`19`,`23` say `0.6.0-alpha.0`.
   Bump-in-lockstep policy should include README banners; or remove the banner and rely on the version badge.

6. **`CodegenOptions.configFile` and `CodegenOptions.debounceMs` are declared but never read.** **MEDIUM.**
   `packages/core/src/types.ts:72-74`. The auto-bootstrap in `module.ts` always calls `codegen.loadConfig(process.cwd())` (line 429) and never passes `configFile`. `debounceMs` lives on the codegen-side resolved config but no path forwards the core option. Fix: either wire them through or remove them from the public type before 1.0 (silently ignored options are worse than absent ones).

7. **Heavy probe (NestFactory-in-fork) is now dead code on the default path.** **MEDIUM.**
   `packages/codegen/src/discovery/routes.ts` (118 LOC) + `packages/codegen/src/discovery/probe.ts` (195 LOC). `useStaticDiscovery` defaults to `true` (`packages/codegen/src/config/load-config.ts:67`), and the CLI never opts out. The only place the heavy probe is exercised is `packages/codegen/test/discovery/routes.spec.ts` + `contracts.spec.ts` + `integration/end-to-end.spec.ts`. The auto-bootstrap (`module.ts`) and the (currently broken) one-shot CLI both flow through the fast path. Decision needed: either keep it as a documented escape hatch (and add an E2E test that flips the flag), or delete probe.ts + routes.ts and lose the `tsx` peer dep.

8. **Three Zod-to-TS implementations; one is unused, one is duplicated inline.** **MEDIUM.**
   - `packages/codegen/src/discovery/contracts-fast.ts:79` — `zodAstToTs(Node)` (used on the fast path).
   - `packages/codegen/src/discovery/probe.ts:37` — `zodToTs(schema)` inlined in the child process.
   - `packages/codegen/src/discovery/zod-to-ts.ts:8` — `zodToTs(schema)` standalone, only imported by its own unit test (`packages/codegen/test/discovery/zod-to-ts.spec.ts`).
   `zod-to-ts.ts` is dead from production. If the heavy probe is kept, the probe should `import` from `zod-to-ts.ts` instead of inlining. If the probe is removed, `zod-to-ts.ts` and its test go away too.

9. **No supertest E2E test for nested partial-reload over the wire.** **MEDIUM.**
   `nested-markers.spec.ts` and `markers-integration.spec.ts` cover the resolver at the service level. None of `packages/core/test/e2e/*.e2e-spec.ts` send `X-Inertia-Partial-Component` + `X-Inertia-Partial-Data` with a dot-notation path and assert the rendered JSON. Given the v3 protocol is the headline feature of 0.9, add one supertest case per shape (top-level, dot-path, defer-on-partial, always-survives-partial).

10. **Error message conventions differ across packages.** **LOW-MEDIUM.**
    Core throws with `[nestjs-inertia] …` prefix (`packages/core/src/errors/exceptions.ts:3`). Codegen uses `ConfigError` / `CodegenError` with no prefix (`packages/codegen/src/exceptions.ts:4`). Client uses plain `new Error('@dudousxd/nestjs-inertia-client: …')` (`packages/client/src/routes-stub.ts:35`). Pick one convention (suggest: prefix every user-facing error with the package name in brackets), and ideally introduce one base class per package that codifies it.

---

## 2. Architecture findings

- **No package import cycles.** Production code only imports `@dudousxd/nestjs-inertia` from `testing` (`packages/testing/src/testing-module.ts:1`) and `client` (`packages/client/src/{react,vue,svelte}/link.ts` for `RegistryRoutes` type). The codegen package emits text that imports `@dudousxd/nestjs-inertia-client` (`packages/codegen/src/emit/emit-api.ts:24`) — that's a generated-code dependency, not a build-time one. Good.
- **The 3 type-only imports in `client/**/link.{ts,tsx,svelte,svelte.d.ts}` are correctly `import type` already.** No fixable here.
- **Auto-bootstrap pattern is well-guarded.** `module.ts:403-446` skips on production, on `NESTJS_INERTIA_CODEGEN_PROBE=1` (good — avoids the spawn loop), on `enabled:false`, on missing package, on missing config. The single warn-on-unexpected-error at line 440 is the right shape. The protected test seam at line 357 is clean and documented.
- **`module.ts` `forRoot` and `forRootAsync` duplicate ~50 lines of provider wiring.** `shellProvider`, `ssrProvider`, the three `APP_INTERCEPTOR` entries, and `exports[]` repeat verbatim at lines 38-91 and 104-159. Extract to a private static `buildRootProviders()` similar to `createFeatureProviders()`.
- **The bootstrap pattern triggers EVEN if the user runs the CLI watcher in another terminal.** That's intentional (lock file makes the second watcher a no-op, see `packages/codegen/src/watch/lock-file.ts`), but the warn message at `module.ts:440-443` doesn't mention the lock-file design; a confused user with both watchers running may worry. Consider linking to docs.
- **`setRouteResolver` global is genuinely a global module-state singleton** (`packages/client/src/routes-stub.ts:22`). For SSR with multiple concurrent requests on the same Node process, this is fine because the resolver itself is pure. For multi-tenant SSR with different route maps, it would be a problem. Document it as "set once at app boot".
- **`InertiaRegistry` empty-interface trick** (`packages/core/src/types/registry.ts:4`) is a clean module-augmentation seam; the eslint-disable for `noEmptyInterface` is appropriate. Biome flags it but the rule is wrong for this use-case — suppress in `biome.json`.
- **`SsrLoaderService` is registered under string token `'INERTIA_SSR_LOADER'`** (`module.ts:55,121,287`) while other tokens are typed via `Symbol`/typed strings in `tokens.ts`. Inconsistent. Move both `INERTIA_SHELL_RENDERER` and `INERTIA_SSR_LOADER` into `tokens.ts`.

## 3. Dead code candidates

- **`packages/codegen/src/discovery/zod-to-ts.ts` (entire file).** Not imported by any production code path; only its test imports it. Either delete + delete the test, or wire it into `probe.ts` (which currently inlines a near-identical copy).
- **`packages/codegen/src/discovery/probe.ts` + `routes.ts` (heavy probe path).** Only exercised in tests, never on the runtime default path. See finding #7.
- **`tsconfig.probe.json`** is referenced only by `routes.ts`. If the heavy probe goes, this can go too.
- **`packages/codegen/src/cli/codegen.ts:23` `await generate(config)` initial call** — see finding #1; this line emits incomplete output and gives users a confusing first impression.
- **`InertiaModuleOptions.codegen.configFile` and `.debounceMs`** (`packages/core/src/types.ts:72,74`) — declared, never read. See finding #6.
- **`MissingCookieDepException`** (`packages/core/src/errors/exceptions.ts:35`) — exported and tested, but the codepaths that throw it (`csrf.guard.ts`, `csrf-cookie.interceptor.ts`) lazily import the deps and would throw a generic `MODULE_NOT_FOUND` from Node's loader before reaching the explicit throw. Worth verifying — if so, either fix the import order or remove the helpful exception.

## 4. Test gap summary

- **No wire-level test for v3 nested partial reload.** The 9 cases in `packages/core/test/nested-markers.spec.ts` use a fake `req`/`res`, not Express/Fastify. Add at minimum one `supertest`-driven case that sets `X-Inertia-Partial-Data: user.profile.avatar` and asserts the response body.
- **No E2E example for `forFeature`.** Three examples are all single-app. Unit/E2E tests do cover it (`packages/core/test/e2e/multi-app.e2e-spec.ts`, `forFeature-fastify.e2e-spec.ts`), but absence from `examples/` weakens the docs story.
- **CLI one-shot mode is untested in a way that would have caught finding #1.** `packages/codegen/test/cli/codegen.spec.ts` exists but doesn't assert routes.ts / api.ts presence after `runCodegen({ watch: false })` against a fixture with controllers.
- **No published-tarball smoke test.** The missing `tsconfig.probe.json` (finding #2) would have shown up if there was a `pnpm pack && npm install ./*.tgz` step somewhere in CI.
- **`useStaticDiscovery: false` (heavy probe path) is exercised only by direct `discoverRoutes()` calls.** The watcher's `else` branch at `watcher.ts:128-135` is not covered by tests; the test suite either passes a custom `discoverRoutesImpl` (line 41) or relies on `useStatic === true`.
- **`InertiaModuleOptions.codegen.enabled` accepts `'auto'` (`types.ts:70`) but the module check at `module.ts:413` is `=== false`,** so any non-`false` value behaves the same. Test 7/8 in `inertia.module.bootstrap.spec.ts` cover the happy values, but no test covers an invalid value like `enabled: 'invalid'`. Not a bug, but suggests the documented type is more nuanced than the implementation.

## 5. Documentation gaps

- **No documented `@RouteName` decorator** (the audit prompt mentions one — it doesn't exist; `route()` is a generated helper function, not a decorator). If users are asking about it, the docs need to clarify the function-vs-decorator distinction in `website/src/content/docs/guides/typed-link.mdx`.
- **`InertiaModuleOptions.codegen.configFile` is documented in JSDoc** at `packages/core/src/types.ts:72` but the user-facing docs site never mentions it. Removing the option (finding #6) also removes a doc tail.
- **No docs page explaining when to use `forRoot` vs `forFeature`.** `website/src/content/docs/guides/multi-app.mdx` exists but only shows `forFeature` examples; doesn't establish the decision tree (single-app, multi-app with shared shell, multi-app with isolated shells).
- **No SSR setup walkthrough** in the website docs that ties together `SsrOptions`, the client `/ssr` subpath, and the Vite SSR build target. Several scattered mentions; no single page.
- **CHANGELOG and README do not currently agree on the version story** (READMEs say 0.3/0.6 alpha — see #5).

## 6. Quick wins (<30 min each)

- Fix the CLI version constant: `packages/codegen/src/cli/main.ts:29` → import `VERSION`.
- Re-export `setRouteResolver` from `packages/client/src/index.ts:13` so docs are accurate.
- Bump all three stale README version banners to `0.9.0-alpha.0`.
- Add `"tsconfig.probe.json"` to `packages/codegen/package.json` `files[]`.
- Run `pnpm exec biome check --write .` to clear the 49 fixable items (organizeImports/format/useImportType/useTemplate/useOptionalChain/useConst/noInferrableTypes). That alone drops error count by ~half.
- Suppress `noEmptyInterface` for `InertiaRegistry` in `biome.json` (currently uses an inline eslint-style suppression that biome ignores — `packages/core/src/types/registry.ts:3`).
- Delete `packages/codegen/src/discovery/zod-to-ts.ts` and its spec (finding #8), OR import it from `probe.ts` to dedupe.
- Move `'INERTIA_SHELL_RENDERER'` / `'INERTIA_SSR_LOADER'` string literals to `tokens.ts`.
- Fix the CLI one-shot mode (finding #1) — one `discoverContractsFast` call wired into `runCodegen`.

## 7. Longer-term refactors (>1 day each)

- **Decide on the heavy probe.** Either delete `routes.ts` + `probe.ts` + `tsconfig.probe.json` + the `tsx` peer dependency, or fully support both paths with parity tests. Right now it's a 313-LOC second implementation that nobody tests in CI's default path.
- **Make biome lint strict.** Current state: 110 errors + 49 warnings. 46 of the errors are `noExplicitAny`, mostly in test helpers that cast `res` to `any` to access fake Express methods. Two options: (a) replace `(res as any)` with a typed `FakeResponse` interface (already exists in `packages/testing/src/fakes/`), or (b) downgrade `noExplicitAny` from warn to off only inside `test/**`. Once those are gone, fix the 3 `noVoidTypeReturn` in `method-spoof.middleware.ts:13,14,16` (they return `next()` which returns `void`; Express signature wants explicit `return; next();`). Then flip CI from `|| true` to hard fail (`packages/.github/workflows/ci.yml:15` block).
- **Extract `forRoot` / `forRootAsync` provider wiring.** ~50 LOC dedup in `packages/core/src/module.ts`.
- **Replace `setRouteResolver` global with a Vite virtual module.** `@nestjs-inertia/routes` virtual module emitted by `nestInertia` plugin — eliminates the boot-time call and the singleton state. Bigger change but removes a class of footguns (forgotten setup, SSR worker reuse, etc.).
- **Add a multi-app (forFeature) example** under `examples/multi-app-express-react` with shared core + two feature scopes (`admin`, `portal`). Mirror the existing examples' structure for parity.
- **Consolidate error classes into a single base per package** with consistent prefixing (finding #10).

---

## Things I checked and found fine

- Cross-package coupling: no cycles, type-only imports already use `import type`.
- All five packages emit a `VERSION` constant in the same place (line 1 of `src/index.ts`).
- All five packages have aligned `engines.node: >=20`, `"type": "module"`, `"main"`, `"types"`, `"exports"`, `"files"` shape — minor: `files` arrays differ between `["dist/", …]` and `["dist", …]` (cosmetic only).
- The shell renderer caches templates (`packages/core/src/shell/file-shell.renderer.ts:39`); not a per-request `readFile`. Engine adapter compilation also cached (`line 62`).
- The `route()` helper generated by codegen uses a single regex `replace` (`packages/codegen/src/emit/emit-routes.ts:83`) — perfectly fine for high-traffic apps.
- Changeset `linked` config (`/.changeset/config.json`) is set up correctly to bump all five packages together — this is the right policy until 1.0, even though it's a maintenance cost.
- The 4 template engine adapters (`ejs`, `handlebars`, `pug`, `liquid`) all use the `MissingTemplateEngineDepException` pattern consistently.
- Auto-bootstrap failure-mode docstring at `module.ts:391-401` is comprehensive.
- Existing supertest E2E coverage is solid for: forRootAsync, forFeature, CSRF, decorators, redirects, shell directives, SSR, template engines, Fastify parity, guards-and-flash. Just missing the partial-reload wire test.
