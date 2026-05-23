# Code Audit V2 — nestjs-inertia

Second-pass read-only audit at HEAD `e6c445e` (branch `main`). 6 packages,
3 examples, 571 lib + 8 example tests, all at `0.9.0-alpha.0`.

---

## 1. Verification of prior fixes

| # | Status | Evidence |
|---|--------|----------|
| **C-2** one-shot codegen runs discovery | ok | `packages/codegen/src/cli/codegen.ts:44-53` discovers routes before `generate()` in non-watch mode. |
| **C-3** `tsconfig.probe.json` in `files[]` | ok | `packages/codegen/package.json:24` (`"files": ["dist", "bin", "tsconfig.probe.json", …]`). |
| **C-4** `setRouteResolver` re-exported from main | ok | `packages/client/src/index.ts:10` (`export { setRouteResolver }`). |
| **Q1** `VERSION` sync + drift test | ok | All five `src/index.ts` files export `VERSION = '0.9.0-alpha.0'`; drift test at `packages/core/test/smoke.spec.ts:9-11` (and mirrored in each package). |
| **Q2** README banners | ok | Root `README.md:5-7` and per-package READMEs all show `0.9.x alpha`. |
| **Q3** biome auto-fix + strict lint in CI | ok | `.github/workflows/ci.yml:28` (`pnpm exec biome ci .`); `biome.json:25-34` strict. |
| **Q4** unused `CodegenOptions` removed | ok | `packages/core/src/types.ts:51-65` only exposes `enabled`. `configFile`/`debounceMs` gone. |
| **D1** heavy probe deprecated | partial | Warning logged in `packages/codegen/src/watch/watcher.ts:128-130`, but **no `@deprecated` JSDoc** on `discoverRoutes()` (`packages/codegen/src/discovery/routes.ts:42`) or `probe.ts`. IDE shows no struck-through call. |
| **D2** `zod-to-ts.ts` source removed | ok | Source gone; **stale `dist/discovery/zod-to-ts.js` artifacts remain** (`packages/codegen/dist/discovery/zod-to-ts.{js,d.ts}`). Will disappear on next `pnpm -r build` if `dist` is cleared, but they ship in current local build. |
| **R1** `buildModuleProviders` extraction | ok | `packages/core/src/module.ts:65-99` shared between `forRoot` (line 109) and `forRootAsync` (line 132). |

No regressions. D1/D2 are paperwork-only gaps, not functional.

---

## 2. Top 10 NEW issues (ranked by impact-to-effort)

### N-1. Typed `<Link>` silently drops the `query` prop in production
**Severity: HIGH** | **Effort: 15 min**

- `packages/client/src/react/link.tsx:22`, `vue/link.ts:50`, `svelte/Link.svelte:19` all call `buildRoute(name, params, query)`.
- The codegen-emitted `route()` runtime in `packages/codegen/src/emit/emit-routes.ts:74-90` accepts only `(name, ...args)` where `args[0]` is `params`. The third positional argument is silently dropped.
- The unit-test mocks (`packages/client/test/*/link.spec.*`) build their own resolver that *does* honour `query`, hiding the bug.
- **Recommendation:** Extend the emitted `route()` signature in `emit-routes.ts` to accept and serialise an optional `query` object (`URLSearchParams`-style), and add a test that imports `route` from a real generated `routes.ts` and asserts the query is appended.

### N-2. Fast AST discovery silently skips controllers without `@ApplyContract`
**Severity: HIGH** | **Effort: 1-2 h**

- `packages/codegen/src/discovery/contracts-fast.ts:294-336` only enumerates methods that carry `@ApplyContract(IDENT)`. Plain `@Get('/dashboard') @Inertia('Dashboard')` methods produce no `RouteDescriptor`.
- Yet `examples/express-react/.nestjs-inertia/routes.ts:5` (and the two siblings) contains `DashboardController.index`, meaning these committed artifacts were produced by the heavy probe, not by today's default fast path.
- Outcome: a fresh `pnpm nestjs-inertia codegen` against any of the three examples will *delete* `DashboardController.index` from `routes.ts`, breaking `route('DashboardController.index')` callers.
- **Recommendation:** Either (a) teach `contracts-fast.ts` to also pick up `@Get/@Post/...` method decorators on `@Controller`-classes and synthesise a `RouteDescriptor` without `contract`, or (b) gate the deprecation of the heavy probe behind reaching feature parity. Add an integration test that runs the fast path against the `express-react` fixture and diffs against the committed `routes.ts`.

### N-3. Inline `Contract.*` calls inside `@ApplyContract(...)` are skipped (warning only)
**Severity: HIGH** | **Effort: 2 h**

- `examples/fastify-vue/src/posts.controller.ts:5-9` and `examples/express-svelte/src/items.controller.ts:5-9` use the inline pattern `@ApplyContract(Contract.get('/api/posts', {...}))`.
- `packages/codegen/src/discovery/contracts-fast.ts:314-320` only resolves identifiers (`Node.isIdentifier(identNode)`); inline `CallExpression`s emit a console warning and are dropped.
- Effect: the two examples' `routes.ts` would lose `posts.list` / `items.list` entries on a fresh fast-path run (they only exist today because the heavy probe ran).
- **Recommendation:** Handle the `CallExpression` case in `extractFromSourceFile` by calling `buildRouteDescriptor(identName /* derive */, identNode, prefix)` directly on the inline expression. Two of three examples exercise this pattern — fix this before the next release.

### N-4. `OnApplicationBootstrap` cross-package coupling without optional-peer declaration
**Severity: MED-HIGH** | **Effort: 5 min**

- `packages/core/src/module.ts:374` dynamically imports `@dudousxd/nestjs-inertia-codegen`, but the package is **not** listed in `packages/core/package.json:peerDependencies` (only `@nestjs/*`, `express`, `fastify`, etc.). Consumers installing just `@dudousxd/nestjs-inertia` see no pnpm warning, but the auto-bootstrap log line tells them to "Install @dudousxd/nestjs-inertia-codegen".
- **Recommendation:** Add `"@dudousxd/nestjs-inertia-codegen": "*"` to `peerDependencies` and mark it optional under `peerDependenciesMeta`. This is the standard NestJS pattern (cf. `@fastify/cookie` in the same file).

### N-5. `NESTJS_INERTIA_CODEGEN_PROBE=1` is a global env var with no namespacing safety
**Severity: MED** | **Effort: 30 min**

- `packages/core/src/module.ts:433` and `packages/codegen/src/discovery/routes.ts:62` use a process-env flag to avoid recursion when the probe boots the user's AppModule.
- If a user already exports `NESTJS_INERTIA_CODEGEN_PROBE=1` in their `.env.production` (unlikely but undetectable), auto-bootstrap will silently no-op forever in dev. The flag is also visible to all child processes spawned from the Nest app, leaking codegen internals.
- **Recommendation:** Either (a) detect the probe via `process.send` IPC presence (the probe is forked with IPC; the user's app isn't) — no env var needed; or (b) keep the env var but rename to `__NESTJS_INERTIA_INTERNAL_PROBE` and document that consumers must never set it. (a) is preferable.

### N-6. SSR loader `data:` URL trick scales poorly with bundle size
**Severity: MED** | **Effort: 1 h**

- `packages/core/src/ssr/ssr-loader.service.ts:33-37` reads the SSR bundle from disk, base64-encodes it, then `import(dataUrl)`. A 5 MB bundle becomes a ~6.7 MB string allocated for one-shot import. Node has no hard cap on `data:` URLs but the V8 string heap allocation is real.
- The comment justifies this as a vitest 3 workaround; production paths inherit the same code.
- **Recommendation:** Branch on `process.env.VITEST` (or `process.env.NODE_ENV === 'test'`): use `data:` URL only there; in real prod use `pathToFileURL(bundlePath).href` so Node's loader streams from disk. The cache (`this.cached`) still amortises one-shot startup cost in both branches.

### N-7. `client/vitest.config.ts` uses deprecated `environmentMatchGlobs`
**Severity: LOW** | **Effort: 20 min**

- `packages/client/vitest.config.ts:14-18` uses `environmentMatchGlobs`, which is **deprecated in vitest 3** and slated for removal (cf. vitest 3 release notes). The `environment: 'jsdom'` setting above already covers all three globs, making the block redundant.
- **Recommendation:** Delete the `environmentMatchGlobs` block; or convert to `test.projects: [...]` per vitest 3 docs for true per-framework isolation.

### N-8. Root `vitest` version mismatch with workspace packages
**Severity: LOW** | **Effort: 1 min**

- `package.json:31` pins root devDependency `"vitest": "^4.1.7"`; every workspace package pins `"vitest": "^3.0.0"`.
- pnpm hoisting will install vitest 4 at the root and vitest 3 inside each package's `node_modules`. `pnpm -r test` resolves the local one, but the root `vitest.config.ts` is loaded by whichever binary you happen to invoke.
- **Recommendation:** Either bump packages to `^4` or pin root to `^3.0.0`. Add a `pnpm.overrides` block as a safety net.

### N-9. Inconsistent `nestjs-inertia.d.ts` shape: `pages` vs `shared-props` re-export
**Severity: LOW** | **Effort: 10 min**

- All three `examples/*/.nestjs-inertia/index.d.ts` re-export `./shared-props.js` (line 3), but the file `shared-props.d.ts` is not in any `.nestjs-inertia/` directory. Compiler resolves the export to nothing.
- **Recommendation:** Either emit a placeholder `shared-props.d.ts` from codegen or drop the line from `emit-index.ts`.

### N-10. `examples/*/inertia/app.*` parity drift between frameworks
**Severity: LOW** | **Effort: 30 min**

- `examples/express-react/inertia/app.tsx:7` exercises `hydrateClientFromInertia` + `QueryClientProvider`; the Vue and Svelte siblings (`app.ts`) do **not**. README claims express-react is "the canonical reference that exercises all five packages" but readers comparing frameworks see different surface area without explanation.
- `examples/express-react/inertia/index.html:7` uses `@viteRefresh`; the others omit it. Vite HMR still works, but the directive is part of `@dudousxd/nestjs-inertia-vite`'s public template language — silent omission is confusing.
- **Recommendation:** Either (a) add the same `hydrateClientFromInertia` boilerplate + `@viteRefresh` to all three example apps so a reader can diff them side-by-side without seeing accidental gaps; or (b) document explicitly in each README that "this example deliberately omits X".

---

## 3. Architecture findings

- **Cross-package coupling stays clean** except for the one new dynamic import (core → codegen) flagged in N-4. The interceptor / middleware / SSR split is unchanged from v1.
- **Public API surface:** `setRouteResolver` is re-exported from both the package root (`packages/client/src/index.ts:10`) **and** each framework subpath (`react/index.ts:3`, `vue/index.ts:3`, `svelte/index.ts:2`). Three copies is intentional convenience but means three docs paragraphs to keep in sync — typed-link.mdx only documents the framework subpath import.
- **`_resolveCodegenModule()` as a "test seam"** (`module.ts:367-376`) is a clean Hexagonal-style port. Verified used in `packages/core/test/inertia.module.bootstrap.spec.ts:63`.
- **`InertiaRegistry` warning comment** (`packages/core/src/types/registry.ts:1-9`) — good defensive doc; this is the right place for it.
- **`examples/*/.nestjs-inertia/` committed as artifacts**: the `.gitignore:11-12` whitelist (`!examples/*/.nestjs-inertia/`) makes intent explicit. This is the right move for AI-assisted dev environments and for offline CI, but **only if N-2 and N-3 are fixed** — otherwise a fresh codegen run produces a diff and a CI guard would fail.

---

## 4. Dead code candidates

| Candidate | File:line | Recommendation |
|-----------|-----------|----------------|
| Heavy probe (`discoverRoutes` + `probe.ts`) | `packages/codegen/src/discovery/routes.ts:42`, `discovery/probe.ts:1-195` | **Don't delete yet.** N-2 + N-3 show the fast path is not at parity. Keep until parity reached, then delete in a single `chore(codegen)!: drop heavy probe` PR. Effort to delete after parity: ~30 min (remove `probe.ts`, `routes.ts`, the `tsconfig.probe.json`, the `tsx` peer dependency, the `else` branch in `cli/codegen.ts` and `watcher.ts`). |
| Stale `dist/discovery/zod-to-ts.{js,d.ts,…}` | `packages/codegen/dist/discovery/zod-to-ts.js` | Add `clean` script (`rm -rf dist`) to `packages/codegen/package.json` build, or commit a `prebuild` step. |
| `inertia/index.d.ts` re-exporting nonexistent `shared-props.js` | `examples/*/.nestjs-inertia/index.d.ts:3` | See N-9 — fix in `emit-index.ts`. |
| `routes-stub.ts` | `packages/client/src/routes-stub.ts` | Correctly the only stub. No duplication. |

---

## 5. Test gap summary

- **Typed `<Link>` query path is untested against real generated `route()`**. All three Link specs (`packages/client/test/{react,vue,svelte}/link.spec.*`) build their own resolver that honours `query`; none import a real codegen-emitted `routes.ts`. This is how N-1 went undetected. Add a single spec that drives a generated `route()` (e.g. via `await import('../fixtures/generated-routes.ts')`) end-to-end through `<Link>`.
- **Vue `<Link>` spec covers fewer props than React/Svelte**: no `routeParams`-with-substitution test (`packages/client/test/vue/link.spec.ts:67-103`). React covers className-passthrough; Vue covers `class`; Svelte covers neither.
- **Fast vs heavy discovery parity is untested**. There is no spec that runs both `discoverRoutes(...)` and `discoverContractsFast(...)` against the same fixture controllers and asserts deep-equal `RouteDescriptor[]`. Such a spec would catch N-2 and N-3 immediately.
- **`examples/*/.nestjs-inertia/` freshness is untested**. No CI step does `pnpm nestjs-inertia codegen && git diff --exit-code examples/`. Until N-2/N-3 are fixed, such a guard would fail; add it once they are.
- **Auto-bootstrap tests are thorough** (`packages/core/test/inertia.module.bootstrap.spec.ts`) — Tests 1-5 cover NODE_ENV=production, missing peer, `enabled:false`, missing config, happy path. Good baseline.
- **No E2E test exercises typed `<Link>` rendered HTML** in any of the three examples. Each `e2e/smoke.spec.ts` only hits the JSON endpoints. Add a fetch with the Inertia headers off, parse `<script id="inertia-page">`, and assert anchors carry the right `href`.

---

## 6. Documentation gaps

- **`SECURITY.md:6-8`** lists 0.9.x and 0.8.x as supported. Once 1.0 ships this table will silently rot — add an "as of" date or a link to the release page.
- **`website/src/content/docs/guides/typed-link.mdx`** does not mention the `query` prop on `<Link>` at all (search "query" → zero hits). This means even if N-1 is fixed, users won't know the feature exists.
- **No doc page covers auto-bootstrap mechanics**. The `module.ts` JSDoc (lines 412-426) is the only narrative. Add `website/src/content/docs/guides/codegen-auto-bootstrap.mdx` documenting the four bootstrap rules and the `codegen.enabled` escape hatch.
- **`packages/codegen/src/discovery/routes.ts`** has no `@deprecated` JSDoc tag, only a runtime warning. IDE call-site grey-out missing.
- **`README.md:36`** claims express-react "exercises all five packages including the typed `<Link>` component" — but the React entrypoint at `inertia/app.tsx` does call `setRouteResolver` but no `<Link>` is rendered in any committed page (verified: no `import.*Link` in `inertia/pages/*.tsx`). The README overstates current coverage.

---

## 7. Quick wins (NEW only, <30 min each)

1. **Fix `query` in emitted `route()`** (N-1) — extend the `emit-routes.ts` template to accept and serialise a query object.
2. **Add `@dudousxd/nestjs-inertia-codegen` as optional peer in core** (N-4) — six lines in `packages/core/package.json`.
3. **Drop deprecated `environmentMatchGlobs`** in `packages/client/vitest.config.ts` (N-7).
4. **Align root vitest version to `^3.0.0`** (N-8) — one-line `package.json` edit + lockfile refresh.
5. **Add `@deprecated` JSDoc on `discoverRoutes`** (D1 paperwork gap) — three lines above `packages/codegen/src/discovery/routes.ts:42`.
6. **Add `clean` script to codegen build** — `"clean": "rm -rf dist"`, `"build": "pnpm clean && tsc -p tsconfig.json"`, kills the stale `zod-to-ts.js` artifact (D2 paperwork gap).
7. **Drop the broken `shared-props.js` re-export in `emit-index.ts`** (N-9).
8. **Align the three example READMEs to the same structure** (intro + run + build + test + dev notes). Pick express-react's depth as the baseline.
9. **Mark `@example/express-svelte` and `@example/fastify-vue` as ignored in `.changeset/config.json`** — currently only express-react is in the `ignore` list. They're `private:true` so changesets won't publish them, but listing them removes the changeset-version warning noise.

## 8. Longer-term refactors (NEW only, >1 day)

1. **Drive fast-path discovery to parity with the heavy probe** (N-2 + N-3). Today the fast path knows `@ApplyContract(IDENT)` and nothing else. Bringing it up to par requires:
   - Recognise method-level `@Get/@Post/...` decorators on `@Controller`-classes.
   - Resolve `@ApplyContract(Contract.get(...))` inline expressions in addition to identifier references.
   - Handle cross-file imports of contract identifiers (currently the AST walker only checks `sourceFile.getVariableDeclaration(name)` — see `contracts-fast.ts:323-330`).
   - Add a parity spec that runs both discoverers against a representative fixture and asserts deep-equality.
   - Estimated 1-2 days including the parity test harness and migration of the three examples.
2. **Replace the SSR `data:` URL trick with a test-vs-prod branch** (N-6) — small in code (one `if`) but the larger work is adding a real test that loads a 5+ MB bundle and measures memory delta, so we don't regress.
3. **Consolidate the three `setRouteResolver` re-export points into one canonical source** — today the function is re-exported from `index.ts` and from each framework subpath. A 1-day refactor: make framework subpaths re-export from `../routes-stub.js` *only* (drop the duplicate at the root, or vice-versa), update the typed-link guide, and add a deprecation alias for whichever path is removed.
4. **Replace the `NESTJS_INERTIA_CODEGEN_PROBE` env signal with IPC-presence detection** (N-5). Same effort tier as #3.

---

## 9. Net improvement since v1

The first audit's ten flagged issues all landed (C-2, C-3, C-4, Q1, Q2, Q3, Q4, R1 fully; D1, D2 functional but with paperwork gaps). Documentation banners, CI lint strictness, and the drift test for `VERSION` are now strong. The new surface added in the same session — auto-bootstrap codegen, ts-morph fast path, typed `<Link>` across three frameworks, two new examples, Vite 6 / vitest 3 / Astro 6 upgrades, Trivy + Grype CI, runtime contract validation — is generally well-engineered, but two of its load-bearing pieces (the fast path and the typed `<Link>` query prop) are not at parity with what they replaced. N-1, N-2, and N-3 should block any "remove the heavy probe" milestone. Beyond those, the repo is in better shape than at v1: cleaner module wiring, fewer dead-code paths, and stronger CI guards.
