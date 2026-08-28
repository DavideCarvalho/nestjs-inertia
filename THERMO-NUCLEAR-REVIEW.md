# Thermo-Nuclear Review: nestjs-inertia

**Verdict.** This is a genuinely well-engineered, well-documented monorepo — the prop-resolution engine is correct, the diagnostics seam is clean, and the test coverage is heavy. But it carries two recurring structural taxes that should be paid down before 1.0: (1) **per-framework / per-platform copy-paste** (Express-vs-Fastify duck-typing re-implemented inline despite a clean adapter interface; React/Vue/Svelte hooks duplicated 3×; four near-identical template adapters), and (2) **marker-resolution logic forked into two divergent code paths** inside `service.ts`. Both are deletable complexity, not just rearrangeable.

## Top findings

### Structural

- **Marker resolution is implemented twice with divergent semantics.** `packages/core/src/service.ts:430-539` (top-level loop) and `service.ts:118-172` (`resolveMarker`, the nested resolver). Both switch over the same five `MarkerKind`s (`always/optional/once/defer/merge`), but the branches are *not* the same: e.g. `once` at top-level resolves on `!keep || resetOnceKeys.includes(key)` (line 451) but the nested version ignores `resetOnceKeys` entirely (line 144); `merge` at top-level records `mergeProps`/`deepMergeProps`/`matchPropsOn` metadata, the nested version silently drops all of it (lines 165-169). **Severity: HIGH.** This is the single highest-risk maintainability hazard in the repo — the two paths *will* drift (they already have), and the divergence is silent. **Remedy:** unify into one recursive `resolveValue(value, fullPath, keep, ctx)` that classifies a marker once and applies the same rules at every depth, with the top-level loop being just `relPath === ''`. The top-level/nested split exists only because dot-path bookkeeping was bolted on later; a single path-aware resolver erases it (~80 LOC and one whole function deleted).

- **Canonical request/response adapter exists but is bypassed by inline duck-typing.** `packages/core/src/adapter/adapter.ts:1-39` defines clean `InertiaRequest`/`InertiaResponse` interfaces, yet three sites re-implement Express-vs-Fastify branching with `as unknown` casts instead of consuming it: `helpers/get-header.ts:8-15` (`req.header()` vs `req.headers[...]`), `helpers/suppress-post-send-writes.ts:23-44` (`as unknown as Record<string, Anyfn>`), and `validation/inertia-validation.filter.ts:120-147` (`sendRedirect` duck-types `status`/`code`, `setHeader`/`header`, `end`/`send`) plus `toSafeSameOriginPath`. **Severity: HIGH.** This is a canonical-layer leak: the cross-runtime concern is supposed to live in `adapter/`, but it's smeared across helpers and the filter, each with its own untyped fallback. **Remedy:** the validation filter and the post-send guard should operate on `InertiaResponse`/`InertiaRequest` (obtained via the existing `RequestAdapter`), deleting `sendRedirect`, the duck-typed branches, and most of `get-header.ts`.

- **React/Vue/Svelte hooks duplicate framework-agnostic logic 3×.** `packages/client/src/{react,vue,svelte}/use-typed-reload.ts` are byte-identical except the import line; same for `use-typed-poll.ts` and the overload boilerplate in `use-typed-form.ts`. **Severity: HIGH.** **Remedy:** extract the router-driving core into `client/src/shared/` (inject the `router` and any reactive primitive as parameters); each framework file becomes a 2-3 line re-export. Removes ~120 LOC and the 3-way drift risk.

### Code-judo (delete, don't rearrange)

- **Four template-engine adapters are the same factory with three knobs.** `packages/core/src/shell/{handlebars,pug,ejs,liquid}.adapter.ts` each repeat: lazy `import`, `try/catch → MissingTemplateEngineDepException`, wrap in a `TemplateEngineAdapter`. Only the package name, the per-engine compile options (`{ filename }`, `{ outputEscape }`), and the call shape differ. **Severity: MEDIUM.** **Remedy:** one `createTemplateEngineAdapter({ pkg, load, compile })` factory; each adapter shrinks to a 3-5 line config object (~85 LOC → ~25).

- **`markers.ts` accessor functions are identity pass-throughs.** `getMarkerKind`/`getMarkerValue`/`getMarkerMeta` (`packages/core/src/markers.ts:103-113`) just `return marker.kind|value|meta`. They add indirection without encapsulation (the `Marker` interface already exposes the fields publicly). **Severity: LOW.** **Remedy:** read the fields directly in `service.ts`, delete the three getters (`isMarker` is the only one earning its keep).

- **`buildRenderDiagnostic` wrapper re-passes a 12-field meta object that the caller already holds.** `service.ts:742-784` exists only to spread the loop-local classification arrays into `buildDiagnostic`. The three publish sites (lines 571, 610, 643) each build the same `meta` literal. **Severity: LOW.** **Remedy:** collect the classification state into one `markerMeta` object during the loop and pass it straight to `buildDiagnostic`; delete the wrapper and the three duplicated literals.

### Spaghetti / boundary

- **`validateLocationUrl` throws-to-catch-itself control flow.** `packages/core/src/helpers/validate-location-url.ts:14-34`: inside the `try`, after passing the scheme check, it *unconditionally throws* "external host" (line 22), which is then re-thrown by the `catch`'s `else` (line 33). The deliberate throws and the parse-failure throws share one `catch`, making intent opaque. **Severity: MEDIUM.** **Remedy:** parse once, branch on result without throwing-as-control-flow: relative→return, absolute→reject (or same-origin-check), unparseable→relative-pattern check.

- **`emitApiObjectBlock` GET-vs-mutation branching.** `packages/codegen/src/emit/emit-api.ts:317-432`: ~115 LOC of parallel query/mutation emission keyed on method × hasParams × hasBody. **Severity: MEDIUM.** **Remedy:** a `queryBuilder`/`mutationBuilder` taking a descriptor object; collapses the nested `if/else`.

- **`contract-validation.pipe.ts` validates against a structural sketch of Zod, not Zod.** `packages/client/src/contract/contract-validation.pipe.ts:22-34` defines a local `{ safeParse }` shape and casts the contract body to it. Works only by coincidence of structural typing; a non-Zod schema or a Zod method change fails silently. **Severity: MEDIUM.** **Remedy:** depend on `z.ZodType` explicitly, or define a real `ContractSchema` abstraction the contract layer owns.

- **Untyped fetcher fallback.** `packages/client/src/fetcher/fetcher.ts:88` casts an unrecognized-content-type `.text()` body `as unknown as T`. Silent lossy coercion. **Severity: MEDIUM.** **Remedy:** throw or return a discriminated result for unrecognized content types.

### Type / casts

- **`suppress-post-send-writes` double-cast erases the `Patchable` contract.** `helpers/suppress-post-send-writes.ts:24,36`: `(res as unknown as Record<string, Anyfn>)[key] = ...`. **Severity: MEDIUM** (folds into the adapter-leak finding above). **Remedy:** patch through the typed `InertiaResponse` seam.

- **Method-spoof middleware duplicated per platform.** `middleware/method-spoof.middleware.ts` vs `middleware/fastify-method-spoof.middleware.ts` repeat the content-type check + `_method` extraction + `ALLOWED` validation. **Severity: LOW.** **Remedy:** one `spoofMethod(reqLike, enabled)` helper called by both.

### File-size / modularity

- **`contracts-fast.ts` is 1124 LOC.** `packages/codegen/src/discovery/contracts-fast.ts`. Bundles AST walking, DTO/form extraction, route-name derivation, and decorator parsing; `extractFromSourceFile` (904-1124) alone is 220 LOC and contains duplicated `@As` decorator parsing (1003-1028 ≈ 1072-1088). **Severity: HIGH (size).** **Remedy:** split into `contracts-dto.ts` + `contracts-decorators.ts`; extract a `parseAsDecorator()` helper.

- **`cli/init.ts` is 917 LOC with 5 framework-switched template generators + fragile string-slice file patching.** `packages/codegen/src/cli/init.ts:278-378` slices on `indexOf('[')`/`createMatch[0]` without bounds checks; `384-629` is a switch-on-framework anti-pattern. **Severity: MEDIUM.** **Remedy:** `FRAMEWORK_TEMPLATES: Record<Framework, ...>` table; bounds-checked patch helpers that throw with context.

## Largest files (>600 LOC, source only)

| File | LOC | Note |
|------|-----|------|
| `packages/codegen/src/discovery/contracts-fast.ts` | 1124 | Split into DTO extraction + decorator parsing; dedupe `@As` parsing. |
| `packages/codegen/src/cli/init.ts` | 917 | Data-drive the 5 template generators; harden file-patch slicing. |
| `packages/core/src/service.ts` | 785 | Unify the two marker resolvers; drop `buildRenderDiagnostic` wrapper → comfortably <650. |
| `packages/codegen/src/emit/emit-api.ts` | 726 | Extract query/mutation builders; share import-grouping + a `CodeBuilder` with the other emit-*.ts. |

(Largest *test* files — `contracts-fast-branches.spec.ts` 1082, `emit-api.spec.ts` 1040, `init.spec.ts` 1020 — are fine as tests but their size mirrors the production-file complexity above.)

## What's good

- **Prop-resolution semantics are correct and the partial-reload/dot-path filtering is genuinely subtle, handled carefully** (the `subKeep`/`nestedKeep` derivation in `service.ts:515-526`, nested `always()` short-circuit at 491-494).
- **Diagnostics are a clean, pure seam.** `diagnostics-builder.ts` is pure, single-source-of-truth for the ~18-field telescope payload, and zero-cost when no subscriber (`diagOn` gate at `service.ts:313`).
- **Excellent inline documentation of *why*** — the streaming fall-back rules, the `end()`-vs-`headersSent` reasoning in `suppress-post-send-writes.ts`, and the open-redirect guards are all explained at the decision points.
- **Module wiring is disciplined:** `forRoot`/`forFeature` share `buildModuleProviders`, fail-fast config validation (`validation.enabled` requires `flashStore`), and the codegen auto-watch is a never-throws, well-gated optional peer.
- **Strong, branch-level test coverage** across all packages, including Express/Fastify parity e2e tests.
