# Implementation Plan — Complete Forms Story: Typed Forms (codegen) + Automatic Validation Error Handling

Status: Ready to execute
Date: 2026-06-09
Spec: `/home/dudousxd/personal/nestjs-inertia/docs/superpowers/specs/2026-06-09-typed-forms-and-validation-design.md`
Scope: `packages/core`, `packages/codegen`, `packages/client`, `examples/express-react`

This plan turns the design spec into five independently shippable phases. Each phase ends green (build + test + typecheck pass for the affected package). Phases 1 and 2 are orthogonal; 3 depends on 2's emit scaffold; 4 depends on 2 (needs ≥1 emitted schema); 5 is docs/watch/Vue-Svelte.

---

## 0. Grounding (verified against real source)

Confirmed by reading the code, the spec's claims hold:

- **Flash read side already exists.** `InertiaService.render()` (`packages/core/src/service.ts:305-319`) calls `this.deps.flashStore.read(this.req.raw)` and `this.share({ errors })` when `props.errors === undefined`. `flashStore` is threaded into `InertiaServiceDeps` (line 211) and supplied for both Express (middleware) and Fastify (`module.ts:422`). **No code writes flash today** — Phase 1 is the first writer. `FlashStore.write?` is already optional in the interface (`flash/flash-store.ts:5`).
- **`ErrorBagInterceptor`** (`interceptor/error-bag.interceptor.ts`) only maps the *happy-path response object* (`v.errors -> { [bag]: v.errors }`). It uses `req.header('X-Inertia-Error-Bag')` (Express-only `.header()`; **note this**, see Risk R6). On the throw path the controller returns nothing, so the interceptor never fires — the filter must replicate the bag-nesting.
- **`RedirectInterceptor`** (`interceptor/redirect.interceptor.ts`) upgrades 302→303 for `PUT/PATCH/DELETE` only, and ships a cross-runtime `getHeader(req, name)` helper (Express `req.header` vs Fastify `req.headers[lower]`). Reuse this helper verbatim. POST is *not* touched by this interceptor → no double-handling with the filter.
- **`InertiaService.location()`** (`service.ts:259`) is the model for emit: `if (req.header('X-Inertia')) res.status(409).setHeader('X-Inertia-Location', url).end(); else res.status(302).setHeader('Location', url).end();`. The `validateLocationUrl()` open-redirect guard (`service.ts:10-39`) is a top-level function in the same file — Phase 1 extracts it to a shared module to reuse.
- **Adapter abstraction** (`adapter/adapter.ts`): `InertiaResponse` exposes `status(code).setHeader(k,v).end()` and works for both Express and raw Fastify. The filter receives the raw platform req/res from `ArgumentsHost.switchToHttp()`, so it must adapt them (see Phase 1 host-resolution note).
- **Module wiring**: `buildModuleProviders()` (`module.ts:69-111`) returns the provider array shared by `forRoot`/`forRootAsync`, registering `APP_INTERCEPTOR` providers. Phase 1 conditionally pushes `{ provide: APP_FILTER, useClass: InertiaValidationFilter }` here. `INERTIA_MODULE_OPTIONS` token holds the options object — inject it into the filter.
- **Codegen discovery**: `contracts-fast.ts` parses contracts via `parseDefineContractCall()` (line 267, currently returns only lowered TS strings via `zodAstToTs()` — it does **not** retain raw zod text) and DTOs via `extractDtoContract()` (line 1104). `tryResolveTypeRef()` (line 1039) and `findType()`/`resolveImportedType()` (498/466) cross files + tsconfig aliases. Decorator reading uses `prop.getDecorators()` / `d.getName()` (e.g. `Filterable` at line 888, `Body`/`Query` at 703/725) — **pure AST, never imports class-validator**. This is the established pattern Phase 3 extends.
- **`emit-api.ts`** has the `emittedNames` alias-on-collision trick (lines 454-468) to reuse for nested-schema naming; `generate.ts` gates `emitApi` on `hasContracts`; `emit-index.ts` adds `./api.js` export when `hasContracts`.
- **Client packaging**: subpath exports live in `packages/client/package.json` `exports` (`.`, `./react`, `./vue`, `./svelte`, `./ssr`, `./server`) and as tsup `entry` keys in `packages/client/tsup.config.ts`. Optional peers use `peerDependenciesMeta.optional`. `zod ^3.22.0` is already a peer. `provider.tsx` shows the React context + `useEffect` patterns; `@inertiajs/react` is the optional peer that supplies `router` and `usePage`.
- **Tests**: vitest in every package (`pnpm test` via turbo at root, or per-package `vitest run`). Codegen has snapshot-style emit specs in `packages/codegen/test/emit/`. Core has `adapter.express.spec.ts` + `adapter.fastify.spec.ts` (fake req/res factories) and `flash-store.spec.ts`. Client has `test/react/`.

---

## Phase 1 — Server filter (`InertiaValidationFilter`)

**Goal:** Validation failures on Inertia non-GET requests auto-flash a field-keyed error bag and 303-redirect back. No client changes. Value even with hand-written forms. Opt-in via `forRoot({ validation: { enabled: true } })`, requires a `flashStore`.

### Files to create

1. `packages/core/src/helpers/validate-location-url.ts`
   - Move `validateLocationUrl()` out of `service.ts` into here and `export` it. Update `service.ts` to import it (removes the duplicate, keeps behavior identical). This is the shared open-redirect guard.

2. `packages/core/src/validation/extract-field-errors.ts`
   - Pure, unit-testable. Signature:
     ```ts
     import type { FlashErrors } from '../flash/flash-store.js';
     export interface ExtractOptions { mergeMessages?: 'first' | 'join'; }
     /** Returns null when the exception is not a recognized validation failure (→ rethrow). */
     export function extractFieldErrors(exception: unknown, opts?: ExtractOptions): FlashErrors | null;
     ```
   - Recognizes (in order):
     - **Dedicated factory payload** `{ __inertiaErrors: FlashErrors }` (from `inertiaValidationExceptionFactory`, below) → return as-is. Lossless, including nested `children` flattened to `items.0.qty`.
     - **`ContractValidationPipe`** shape `{ message: 'Contract validation failed', issues: ZodIssue[] }` → for each issue key = `issue.path.join('.')`, value = `issue.message`; `mergeMessages` controls first-wins vs join.
     - **Raw `ZodError`** (`err.issues` array, has `.name === 'ZodError'`) → same issue mapping.
     - **Flat class-validator `message: string[]`** heuristic → split each string on first space, leading token = key. Lossy fallback for flat DTOs.
     - Anything else → `null`.
   - Reads `BadRequestException.getResponse()` when given a Nest exception (duck-typed: `typeof ex.getResponse === 'function'`), else inspects the raw object.

3. `packages/core/src/validation/exception-factory.ts`
   - The blessed path. Maps class-validator `ValidationError[]` → `{ __inertiaErrors }`:
     ```ts
     import { BadRequestException, type ValidationError } from '@nestjs/common';
     export function inertiaValidationExceptionFactory(errors: ValidationError[]): BadRequestException {
       return new BadRequestException({ __inertiaErrors: flattenValidationErrors(errors) });
     }
     /** Recursively flattens nested children into dot/numeric-index paths: items.0.qty */
     export function flattenValidationErrors(errors: ValidationError[], prefix?: string): FlashErrors;
     ```
   - `ValidationError` type-only import from `@nestjs/common` (already a peer; no class-validator runtime dep). `flattenValidationErrors` joins `error.property` with prefix (`prefix ? `${prefix}.${property}` : property`), takes the first/joined `Object.values(error.constraints ?? {})` message as the value, and recurses into `error.children`.

4. `packages/core/src/validation/inertia-validation.filter.ts`
   - The `@Catch` filter:
     ```ts
     import { ArgumentsHost, Catch, type ExceptionFilter, BadRequestException, Inject } from '@nestjs/common';
     import { INERTIA_MODULE_OPTIONS } from '../tokens.js';

     @Catch(BadRequestException)
     export class InertiaValidationFilter implements ExceptionFilter {
       constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions) {}
       async catch(exception: BadRequestException, host: ArgumentsHost): Promise<void> { ... }
     }
     ```
   - Algorithm in `catch`:
     1. `const http = host.switchToHttp(); const req = http.getRequest(); const res = http.getResponse();`
     2. Gate: only handle when `getHeader(req, 'X-Inertia')` truthy AND `req.method !== 'GET'`. Else `throw exception` (rethrow → normal Nest 400 JSON).
     3. `const errors = extractFieldErrors(exception, { mergeMessages: this.options.validation?.mergeMessages ?? 'first' });` If `null` → rethrow.
     4. `const bag = getHeader(req, 'X-Inertia-Error-Bag'); const scoped = bag ? { [bag]: errors } : errors;`
     5. `const flashStore = this.options.flashStore;` (guaranteed present by bootstrap check). `await flashStore.write(req.raw ?? req, scoped);`
     6. Resolve redirect-back target (see §4.3): `X-Inertia-Referer` (reserved) → `Referer` header → `this.options.validation?.fallbackRedirect ?? '/'`. Strip cross-origin to same-origin path+query via `validateLocationUrl` (catch throw → fallback).
     7. Emit 303: `sendRedirect(res, 303, target)` — cross-runtime helper.
   - Extract `getHeader` into a shared `packages/core/src/helpers/get-header.ts` and re-import in both `redirect.interceptor.ts` and the filter (avoid duplication; keeps the Express/Fastify behavior in one place).
   - `sendRedirect(res, status, url)`: handles Express (`res.status(status).setHeader('Location', url).end()`) and Fastify (`res.code?.(status)` / `res.raw` fallback). Model on `service.ts`'s `res.status().setHeader().end()` which already works in both adapters via the `InertiaResponse` shape; for the raw platform response in `catch`, duck-type: prefer `res.status` if function, else `res.code`, set `Location` via `setHeader`/`header`, then `.end()`/`.send()`.

### Files to modify

5. `packages/core/src/types.ts`
   - Add:
     ```ts
     export interface InertiaValidationOptions {
       enabled?: boolean;             // default false (additive / non-breaking)
       fallbackRedirect?: string;     // default '/'
       mergeMessages?: 'first' | 'join'; // default 'first'
     }
     ```
   - Extend `InertiaModuleOptions` with `validation?: InertiaValidationOptions;`

6. `packages/core/src/module.ts`
   - In `buildModuleProviders()`, after the interceptor providers, conditionally append the filter. Because the provider list is built statically (no options in scope there), register it as an `APP_FILTER` factory that no-ops when disabled — or gate at provider-build time by reading options. Cleanest with the current structure: make `buildModuleProviders()` accept nothing but push a factory provider:
     ```ts
     {
       provide: APP_FILTER,
       inject: [INERTIA_MODULE_OPTIONS],
       useFactory: (opts: InertiaModuleOptions) => {
         if (!opts.validation?.enabled) return { catch() {} }; // inert filter
         if (!opts.flashStore) {
           throw new InvalidInertiaConfigException(
             'validation.enabled requires a flashStore (the filter has nowhere to write the error bag).',
           );
         }
         return new InertiaValidationFilter(opts);
       },
     }
     ```
   - Import `APP_FILTER` from `@nestjs/core`, `InvalidInertiaConfigException` (already imported), and the filter class.

7. `packages/core/src/index.ts`
   - Export: `InertiaValidationFilter`, `inertiaValidationExceptionFactory`, `flattenValidationErrors`, `extractFieldErrors`, type `InertiaValidationOptions`. Bump `VERSION`.

### §2.x mapping table — NOT in this phase
The class-validator→zod table is a **Phase 3** deliverable (it's a codegen concern). Phase 1's `flattenValidationErrors` only reads class-validator *runtime output* (`ValidationError[]`), never the decorators.

### Risks (Phase 1)
- **R1 — flashStore.write store-agnostic.** Filter calls `write(req.raw, scoped)`. If the user's store needs the *session* (express-session / @fastify/session), they receive `req.raw` (the platform req). Document an express-session and @fastify/session example `FlashStore`. The existing read side already passes `req.raw`, so symmetry holds.
- **R2 — Redirect-back target.** `Referer` is the canonical source; reject cross-origin (open-redirect). If `Referer` absent (some test clients), fall to `fallbackRedirect`. Add a test for missing Referer.
- **R3 — Double-handling.** `RedirectInterceptor` only touches PUT/PATCH/DELETE and only *successful* 302s. The filter sets 303 directly on the throw path → no overlap. Verify with an interaction test (POST invalid → exactly one 303, no interceptor mutation).
- **R6 — ErrorBag header read parity.** `ErrorBagInterceptor` uses `req.header(...)` (Express-only). The filter must use the shared cross-runtime `getHeader` so Fastify error-bag scoping works. (Out of scope to fix the interceptor here, but note it: on Fastify happy-path the existing interceptor may already miss the bag — flag for a follow-up.)

### Verification (Phase 1)
```bash
cd packages/core
pnpm vitest run validation                       # unit: extract-field-errors, exception-factory, filter
pnpm vitest run adapter.express adapter.fastify  # e2e both runtimes
pnpm test && pnpm typecheck && pnpm build
```
New specs:
- `packages/core/test/validation/extract-field-errors.spec.ts` — factory payload (nested→`items.0.qty`), Contract `issues`, raw `ZodError`, flat `string[]` heuristic, non-validation BadRequest → `null`.
- `packages/core/test/validation/exception-factory.spec.ts` — nested `children` flatten.
- `packages/core/test/validation/inertia-validation.filter.express.spec.ts` + `.fastify.spec.ts` — fake req/res (mirror `adapter.*.spec.ts`): POST invalid + `X-Inertia` → `write` called with field keys, response 303 + `Location: <Referer>`; error-bag variant → `{ [bag]: {...} }`; non-Inertia → rethrow (no write); cross-origin Referer → fallback.
- `packages/core/test/validation/module-wiring.spec.ts` — `forRoot({ validation:{enabled:true} })` without `flashStore` throws; with store registers a real filter.

**Ship:** changeset (minor, `@dudousxd/nestjs-inertia`).

---

## Phase 2 — zod emit, Path A (contract reuse)

**Goal:** Emit `forms.ts` with re-exported (or inlined) zod schemas for `defineContract` bodies/queries. No RHF. Schemas usable standalone (Vue/Svelte/manual). Snapshot-tested.

### Files to create

1. `packages/codegen/src/emit/emit-forms.ts`
   - Signature mirrors `emit-api.ts`:
     ```ts
     export async function emitForms(routes: RouteDescriptor[], outDir: string, config?: ResolvedFormsConfig): Promise<boolean>;
     // returns true if a forms.ts was written (drives hasForms flag / index export)
     ```
   - Output shape (per spec §5.1):
     ```ts
     // Generated by @dudousxd/nestjs-inertia-codegen. Do not edit.
     import { z } from 'zod';
     import { loginContract } from '../app/auth/auth.contract.js'; // re-export path (Path A, named ref)

     export const LoginBodySchema = loginContract.body;
     export type LoginBody = z.infer<typeof LoginBodySchema>;

     export const formSchemas = { 'auth.login': LoginBodySchema } as const;
     ```
   - When the contract `body`/`query` is **not** an importable named const (inline `defineContract({...})`), inline the captured `.getText()` of the body zod initializer instead of re-exporting. **Decision (spec §5.2): re-export when a named/importable const exists, else inline.**
   - **Naming:** `<PascalRouteName>BodySchema` / `<…>QuerySchema`. PascalRouteName = dot-name camelCased + capitalized (`auth.login` → `Login`). On collision across controllers, prefix with the class segment (`AuthLogin`), reusing the `emittedNames` alias approach from `emit-api.ts`. Type alias `<…>Body` = `z.infer<typeof …Schema>`.
   - Gate: emit only for routes whose `contract.contractSource` has `bodyZodRef`/`bodyZodText` (or query equivalents). GET routes contribute only `QuerySchema`.
   - Determinism: routes sorted by name; properties in source order (already guaranteed by inlined text / re-export).

### Files to modify

2. `packages/codegen/src/discovery/types.ts`
   - Extend `ContractSource`:
     ```ts
     bodyZodText?: string | null;   // raw zod source for body (inline)
     bodyZodRef?: TypeRef | null;   // importable named schema to re-export
     queryZodText?: string | null;
     queryZodRef?: TypeRef | null;
     formWarnings?: string[];       // (populated in Phase 3)
     ```

3. `packages/codegen/src/discovery/contracts-fast.ts`
   - Extend `parseDefineContractCall()` to also capture, for `body`/`query`:
     - `bodyZodText` = the initializer node's `.getText()`.
     - `bodyZodRef` = when the contract value is an identifier reference to an exported const (or the `defineContract` call is assigned to an exported const we can import), resolve via `tryResolveTypeRef`-style logic to `{ name, filePath }`. For the inline-call case where the whole `defineContract({...})` is bound to an exported variable, re-export the member access `<constName>.body`.
   - Thread the new fields onto the returned `ContractSource` in both the `@ApplyContract` branch and `extractDtoContract` (leave Path B fields null in this phase).

4. `packages/codegen/src/generate.ts`
   - After `emitApi`, add:
     ```ts
     const hasForms = await emitForms(routes, config.codegen.outDir, config.forms);
     await emitIndex(config.codegen.outDir, hasContracts, hasForms);
     ```
   - (Reorder so `emitIndex` is called once with both flags; currently it's called before `emitApi` — move it after, or pass `hasForms` precomputed.)

5. `packages/codegen/src/emit/emit-index.ts`
   - Add `hasForms` param → push `export * from './forms.js';`.

6. `packages/codegen/src/config/types.ts`
   - Add to `UserConfig` and `ResolvedConfig`:
     ```ts
     forms?: { enabled?: boolean; watch?: string; zodImport?: string };
     // Resolved: { enabled: boolean; watch: string; zodImport: string }
     ```
   - Defaults in `load-config.ts`: `enabled: true` (when ≥1 validatable body), `watch: 'src/**/*.dto.ts'`, `zodImport: 'zod'`.

7. `packages/codegen/src/watch/watcher.ts`
   - Mirror the `generate.ts` change in the contracts-watcher branch: call `emitForms` + pass `hasForms` to `emitIndex`. (DTO-glob watching is Phase 5; Path A only needs the contracts glob since contracts live in controllers.)

### Verification (Phase 2)
```bash
cd packages/codegen
pnpm vitest run emit-forms discovery
pnpm test && pnpm typecheck && pnpm build
```
New specs:
- `packages/codegen/test/emit/emit-forms.spec.ts` — feed fixture controllers with `defineContract` (named const + inline) through discovery → assert exact `forms.ts` text: re-export case, inline case, GET query-only, `formSchemas` map, name-collision aliasing. Deterministic ordering.
- Extend `packages/codegen/test/discovery/contracts-fast.spec.ts` for `bodyZodRef`/`bodyZodText` capture.

**Ship:** changeset (minor, `@dudousxd/nestjs-inertia-codegen`).

---

## Phase 3 — zod emit, Path B (class-validator → zod) + the mapping table

**Goal:** Translate class-validator-decorated DTOs into zod schemas via pure AST reading. The §2.2 mapping table is the concrete deliverable here. Heavy snapshot coverage. Falls back to type-only schemas for undecorated DTOs.

### Files to create

1. `packages/codegen/src/discovery/dto-to-zod.ts`
   ```ts
   export interface DtoZodResult {
     schemaText: string;                      // e.g. "z.object({ email: z.string().email() })"
     namedNestedSchemas: Map<string, string>; // name → "z.object({...})" hoisted above parent
     warnings: string[];
   }
   export function extractZodFromDto(
     classDecl: ClassDeclaration,
     sourceFile: SourceFile,
     project: Project,
   ): DtoZodResult;
   ```
   - Walks `classDecl.getProperties()`. For each property:
     - **Base type** from the TS property type node (`prop.getTypeNode()`): `string`→`z.string()`, `number`→`z.number()`, `boolean`→`z.boolean()`, `Date`→`z.coerce.date()`, `File`/`Express.Multer.File`→`z.instanceof(File)` (spec §7.1), array `T[]`→`z.array(<T>)`, unknown→`z.unknown()`.
     - **Decorators** read via `prop.getDecorators()` + `d.getName()` + literal args (pure AST, exactly like `Filterable`/`Body` reading in `contracts-fast.ts`). Apply the table below as refinements/overrides.
   - Nested DTO resolution via existing `findType()`/`resolveImportedType()`; emit nested as named const into `namedNestedSchemas`, reference by name. Dedupe by class name; alias on collision (`emittedNames` trick). Recursion guard (reuse `collectEntityFields` depth/visited pattern) → `z.lazy(() => XSchema)` on cycle.
   - Custom messages: decorator `{ message: '...' }` literal → emit `{ message: '...' }` into the zod call (e.g. `.email({ message: '...' })`). `message` as a *function* → skip + warn.
   - Unmappable decorators (unknown name, `@ValidateIf`, `@IsStrongPassword`, async/DB validators) → keep base type, append `// @X: not translatable to zod (server-only)` comment, push a deduped warning (one `console.warn` per decorator name per run, matching the existing warn pattern in `contracts-fast.ts:1282`).

#### §2.2 class-validator → zod mapping table (the deliverable)

Base type inferred from the TS property type first, then decorators refine; `@IsString` etc. can override an ambiguous base.

| class-validator decorator | zod emission | Notes |
|---|---|---|
| `@IsString()` | `z.string()` | base override |
| `@IsNumber()` / `@IsInt()` | `z.number()` / `z.number().int()` | `@IsInt` → `.int()` |
| `@IsBoolean()` | `z.boolean()` | |
| `@IsDate()` | `z.coerce.date()` | wire is string → coerce |
| `@IsEmail()` | `z.string().email()` | |
| `@IsUrl()` | `z.string().url()` | |
| `@IsUUID()` | `z.string().uuid()` | |
| `@MinLength(n)` | `.min(n)` | string length |
| `@MaxLength(n)` | `.max(n)` | string length |
| `@Length(min,max)` | `.min(min).max(max)` | |
| `@Min(n)` / `@Max(n)` | `.min(n)` / `.max(n)` | numeric |
| `@IsPositive()` | `.positive()` | |
| `@IsNegative()` | `.negative()` | |
| `@Matches(/re/)` | `.regex(/re/)` | copy literal regex AST text |
| `@IsEnum(E)` | `z.nativeEnum(E)` or `z.enum([...])` | resolve enum members via existing enum branch in `contracts-fast.ts` |
| `@IsIn([a,b])` | `z.enum(['a','b'])` (strings) / `z.union([z.literal(...)])` | reuse array-literal parsing |
| `@IsOptional()` | wrap `.optional()` | also relaxes TS prop to optional |
| `@IsNotEmpty()` | `.min(1)` on string; `.refine(v=>v!=null)` general | |
| `@IsArray()` + `@ValidateNested({each:true})` + `@Type(()=>Child)` | `z.array(<ChildSchema>)` | recurse into Child; emit ChildSchema named const |
| `@ValidateNested()` + `@Type(()=>Child)` (single) | `<ChildSchema>` | nested object |
| `@IsObject()` | `z.object({}).passthrough()` if no nested info | |
| `@Allow()` | `z.unknown()` | explicit allow |
| `@IsDefined()` | drop `.optional()` (required) | |
| unmappable (`@IsStrongPassword`, `@ValidateIf`, custom) | base type + `// not translatable` comment | skip + dedup warn |

### Files to modify

2. `packages/codegen/src/discovery/contracts-fast.ts`
   - In `extractDtoContract()`: when the `@Body()`/`@Query()` param resolves (via `tryResolveTypeRef`/`findType`) to a **class** declaration, call `extractZodFromDto` and populate `bodyZodText`/`queryZodText` (synthesized) + `formWarnings`. Precedence: a `defineContract` body (Phase 2 `bodyZodRef`/`bodyZodText`) always wins; only synthesize when none present (spec §2.1).
   - For undecorated/plain interfaces → emit a type-only `z.object({...}).passthrough()` with a `// no validation rules found` comment (spec §2.1 case 3).

3. `packages/codegen/src/emit/emit-forms.ts`
   - Handle the synthesized-text path: hoist `namedNestedSchemas` above the parent `export const`, then emit the parent referencing them. Surface `formWarnings` as a header comment block and via `console.warn`.

### Verification (Phase 3)
```bash
cd packages/codegen
pnpm vitest run emit-forms dto-to-zod discovery
pnpm test && pnpm typecheck && pnpm build
```
New/extended specs:
- `packages/codegen/test/discovery/dto-to-zod.spec.ts` — one case per table row, `@IsOptional`, `@IsEnum` resolution, nested `@ValidateNested`/`@Type`, array-of-nested (`items.0.qty` shape implied), custom `{ message }`, unmappable (warn + comment + base type), name-collision aliasing, recursion → `z.lazy`.
- Extend `emit-forms.spec.ts` with DTO fixtures and a precedence case (contract beats decorators).
- Assert each generated schema is **valid TS** (the emit specs already parse output; add a `z.infer` typecheck fixture under `examples/express-react` exercised in Phase 5).

**Ship:** changeset (minor, `@dudousxd/nestjs-inertia-codegen`).

---

## Phase 4 — React `useInertiaForm` hook + `/react-form` subpath

**Goal:** One-call typed form hook wrapping RHF + zodResolver + Inertia submit + automatic server-error merge + reset-on-success. RHF as optional peer behind a new subpath.

### Files to create

1. `packages/client/src/shared/merge-server-errors.ts` (framework-free — reused by Vue/Svelte later)
   ```ts
   export type SetFieldError = (path: string, message: string) => void;
   export interface MergeResult { applied: string[]; formError: string | undefined; }
   /**
    * Reads page errors, scopes to `bag` if given, calls setError per field path,
    * and aggregates unknown keys / `_` / top-level message into formError.
    */
   export function mergeServerErrors(
     pageErrors: Record<string, unknown> | undefined,
     bag: string | undefined,
     setError: SetFieldError,
     knownFields?: Set<string>,
   ): MergeResult;
   ```

2. `packages/client/src/react-form/index.ts` (subpath entry)
   - Re-exports `useInertiaForm` and its types.

3. `packages/client/src/react-form/use-inertia-form.ts`
   ```ts
   import { useForm, type UseFormReturn, type FieldValues, type DefaultValues } from 'react-hook-form';
   import { zodResolver } from '@hookform/resolvers/zod';
   import { router, usePage } from '@inertiajs/react';
   import type { ZodType } from 'zod';
   import { mergeServerErrors } from '../shared/merge-server-errors.js';

   export interface UseInertiaFormOptions<TValues extends FieldValues> {
     schema: ZodType<TValues>;
     action: string | { method: 'post' | 'put' | 'patch' | 'delete'; url: string };
     defaultValues?: DefaultValues<TValues>;
     errorBag?: string;
     resetOnSuccess?: boolean;
     visitOptions?: Record<string, unknown>;
     formProps?: Parameters<typeof useForm<TValues>>[0];
   }
   export interface UseInertiaFormReturn<TValues extends FieldValues> extends UseFormReturn<TValues> {
     submit: ReturnType<UseFormReturn<TValues>['handleSubmit']>;
     isSubmitting: boolean;
     formError: string | undefined;
   }
   export function useInertiaForm<TValues extends FieldValues>(
     options: UseInertiaFormOptions<TValues>,
   ): UseInertiaFormReturn<TValues>;
   ```
   - Behavior (spec §3.3):
     - `const form = useForm<TValues>({ resolver: zodResolver(options.schema), defaultValues, ...formProps });`
     - `submit = form.handleSubmit(values => { const { method, url } = normalizeAction(options.action); router[method](url, values, { ...visit, headers: { ...(errorBag ? { 'X-Inertia-Error-Bag': errorBag } : {}), ...visitHeaders }, onStart: () => setProcessing(true), onFinish: () => setProcessing(false), onSuccess: () => { if (resetOnSuccess) form.reset(defaultValues); }, onError: () => {/* handled by usePage effect */} }); });`
     - Server-error merge: `const page = usePage(); useEffect(() => { const known = new Set(Object.keys(form.getValues())); const { formError } = mergeServerErrors(page.props.errors as any, errorBag, (path, message) => form.setError(path as any, { type: 'server', message }), known); setFormError(formError); }, [page.props.errors]);` Guard loops by tagging `type:'server'` and keying the effect on the `page.props.errors` object identity.
     - `isSubmitting = form.formState.isSubmitting || processing;`
   - `react`, `react-hook-form`, `@hookform/resolvers`, `@inertiajs/react`, `zod` are all imports → all optional peers; the subpath is the firewall so non-form bundles never pull RHF.

### Files to modify

4. `packages/client/package.json`
   - `exports`: add a `./react-form` block mirroring `./react`:
     ```json
     "./react-form": {
       "types": "./dist/react-form/index.d.ts",
       "import": "./dist/react-form/index.js",
       "require": "./dist/react-form/index.cjs"
     }
     ```
   - `peerDependencies`: add `"react-hook-form": "^7.50.0"`, `"@hookform/resolvers": "^3.3.0"`.
   - `peerDependenciesMeta`: mark both `optional: true` (consistent with `@inertiajs/*`).
   - `devDependencies`: add `react-hook-form`, `@hookform/resolvers` for tests.

5. `packages/client/tsup.config.ts`
   - Add entry `'react-form/index': 'src/react-form/index.ts'`.
   - Add `'react-hook-form'`, `'@hookform/resolvers'` to `external`.

### Risks (Phase 4)
- **R4 — Optional-peer failure modes.** Importing `@dudousxd/nestjs-inertia-client/react-form` without RHF installed throws at import. Acceptable (it's an explicit opt-in subpath), but document the required install (`react-hook-form @hookform/resolvers`). Do **not** import react-form from the base `./` entry.
- **R5 — Server-error effect loops.** `form.setError` re-renders; if the effect depends on `formState.errors` it loops. Key the effect strictly on `page.props.errors` identity and tag server errors `type:'server'`. Test the no-loop invariant.
- **R7 — `usePage().props.errors` shape under error-bag.** Must read `props.errors[bag]` when `errorBag` set (symmetric with Phase 1's write). `mergeServerErrors` owns the scoping; unit-test both shapes.

### Verification (Phase 4)
```bash
cd packages/client
pnpm vitest run react-form merge-server-errors
pnpm test && pnpm typecheck && pnpm build
ls dist/react-form/index.js dist/react-form/index.d.ts   # subpath built
```
New specs (jsdom, `@testing-library/react`, mock `@inertiajs/react` `router`/`usePage`):
- `packages/client/test/shared/merge-server-errors.spec.ts` — pure: scoping by bag, unknown keys → formError, `_`/top-level → formError.
- `packages/client/test/react-form/use-inertia-form.spec.ts` — client-invalid → no `router` call + `errors` populated; valid → `router[method]` with values + `X-Inertia-Error-Bag` header when set; `usePage` errors change → `setError` on right paths scoped by bag; `resetOnSuccess` resets on `onSuccess`; `isSubmitting` toggles on `onStart`/`onFinish`; no infinite re-render.

**Ship:** changeset (minor, `@dudousxd/nestjs-inertia-client`).

---

## Phase 5 — Watch-mode DTO globs + docs + Vue/Svelte schema patterns + example wiring

**Goal:** DTO files trigger regen; document framework recipes; wire `examples/express-react` end-to-end.

### Files to modify

1. `packages/codegen/src/watch/watcher.ts`
   - Add a third chokidar watcher on `config.forms.watch` (default `'src/**/*.dto.ts'`), merged debounce with the contracts watcher (or its own, reusing `config.contracts.debounceMs`). On any match → full `generate(config, routes)` re-run (DTO changes affect synthesized schemas). Close it in the returned `close()`.
   - Determinism for snapshots (spec §5.5): properties in source order; nested-schema hoist order = topological by dependency then alphabetical.

2. `packages/codegen/src/config/load-config.ts`
   - Resolve `forms.watch` default and pass through.

### Files to create (docs + Vue/Svelte)

3. `packages/client/src/shared/merge-server-errors.ts` — already created in Phase 4; in Phase 5 it's the shared seam Vue/Svelte recipes reference (no hook ships for them in v1, spec §6).

4. Docs (under `docs/` or package READMEs — no new top-level docs unless requested):
   - **Forms guide**: `useInertiaForm` before/after (spec §3.5), the shared error-key contract (`email`, `address.city`, `items.0.qty`), two-lane note (forms → `useInertiaForm`; data mutations → TanStack `mutationOptions`), CSRF delegation (spec §7.4), file uploads / FormData (spec §7.1), multi-error-bag pages (spec §7.6).
   - **Vue recipe**: `LoginBodySchema` + `@vee-validate/zod` `toTypedSchema` or manual `safeParse`; server errors via `usePage().props.errors` using `mergeServerErrors`.
   - **Svelte recipe**: `sveltekit-superforms`/manual `safeParse`; same server-error path.
   - **FlashStore examples**: express-session-backed and @fastify/session-backed (`read`/`write`) — closes Phase 1 R1.

### Example wiring

5. `examples/express-react`
   - Add a `LoginDto` (class-validator) or a `defineContract` login, an `auth.controller.ts` POST that throws on invalid, enable `forRoot({ flashStore, validation: { enabled: true } })` with a session flash store, and a `Login.tsx` using `useInertiaForm` (spec §3.5 "after"). Confirms the full loop (1→8) end-to-end and the generated `forms.ts` typechecks.

### Verification (Phase 5)
```bash
# codegen watch
cd packages/codegen && pnpm vitest run watch
# example builds + typechecks (forms.ts is consumed by Login.tsx)
cd examples/express-react && pnpm build && pnpm typecheck
# whole repo green
cd <repo-root> && pnpm test && pnpm typecheck && pnpm build
```
New spec:
- `packages/codegen/test/watch/forms-watch.spec.ts` — touching a `*.dto.ts` re-runs generate and re-emits `forms.ts`.

**Ship:** changeset (minor across codegen + docs).

---

## Cross-cutting risks (the four flagged)

1. **Interaction with `ErrorBagInterceptor` / `RedirectInterceptor`** — Filter runs on the *throw* path where the interceptor's `map` never fires; the filter replicates bag-nesting itself, producing the *same* `props.errors = { [bag]: {...} }` the interceptor yields on success (symmetry by construction, spec §4.4). `RedirectInterceptor` only touches PUT/PATCH/DELETE successful 302s; the filter sets 303 directly on POST/PUT/PATCH/DELETE throws → no double-handling. **Verify with an explicit interaction test.** Latent bug to flag: `ErrorBagInterceptor` reads `req.header()` (Express-only) — Fastify happy-path bag-scoping may already be broken independent of this work.

2. **Redirect-back target resolution** — Priority `X-Inertia-Referer` (reserved) → `Referer` → `fallbackRedirect`. Cross-origin/protocol-relative rejected via the shared `validateLocationUrl` (now extracted to `helpers/`); reject → fallback. Test: present Referer, absent Referer, cross-origin Referer, `//evil.com`.

3. **Fastify vs Express parity** — All header reads go through the shared `getHeader` (raw-Fastify `req.headers[lower]` vs Express `req.header`). Redirect emit via a `sendRedirect` duck-typing `status`/`code`+`setHeader`/`header`+`end`/`send`. The filter receives raw platform req/res from `ArgumentsHost`; `req.raw` may be undefined under Express (it's the req itself) — pass `req.raw ?? req` to `flashStore.write` and to `validateLocationUrl` origin checks. **Dedicated `.express.spec.ts` + `.fastify.spec.ts` for the filter** (mirror existing adapter specs).

4. **Optional-peer-dep failure modes** — `react-hook-form` + `@hookform/resolvers` are optional peers reachable *only* through `./react-form`; base `./` and `./react` never import them. zod stays a (already-declared) optional-by-usage peer. Importing `./react-form` without RHF installed throws at import — documented as the explicit opt-in cost. Codegen `forms.ts` imports only `zod` (framework-agnostic) so Vue/Svelte consumers never pull RHF.

---

## Dependency / ship order

```
Phase 1 (core filter) ──┐
                        ├── independent, ship in any order
Phase 2 (codegen Path A)┘
        │
        ├── Phase 3 (codegen Path B) depends on Phase 2 emit scaffold
        │
        └── Phase 4 (React hook) depends on Phase 2 (≥1 emitted schema)
                    │
                    └── Phase 5 (watch + docs + example) depends on 1–4
```

Each phase: one changeset, all affected-package tests + typecheck + build green before ship.
