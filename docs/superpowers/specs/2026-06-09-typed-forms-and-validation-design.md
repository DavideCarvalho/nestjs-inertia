# Design Spec — Complete Forms Story: Typed Forms (codegen) + Automatic Validation Error Handling

Status: Design (implementation-ready)
Date: 2026-06-09
Scope: `nestjs-inertia` monorepo (`packages/core`, `packages/client`, `packages/codegen`)

This spec covers **two coupled pieces** that together make `nestjs-inertia` forms feel like Laravel/Inertia:

1. **`InertiaValidationFilter`** (server): turn class-validator / Zod / contract validation failures into a flashed Inertia error bag + 303 redirect-back — automatically.
2. **Typed forms via codegen** (client): emit a **zod schema** per validated endpoint + a **`useInertiaForm`** hook (react-hook-form + zod resolver), where the server error bag merges into the same RHF error state.

The unifying invariant is a **shared error-key contract**: the field key the server flashes (`email`, `address.city`, `items.0.qty`) is byte-identical to the RHF field path. One source of truth for errors.

---

## 0. Grounding in the real source

Symbols and files this design extends (all paths absolute):

- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/flash/flash-store.ts`
  - `FlashErrors = Record<string, string | Record<string, string>>` and `FlashStore { read(req); write?(req, errors) }`. **`write` is already optional in the interface but no current code path calls it** — Piece 1 is the first writer.
- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/service.ts`
  - `InertiaService.render()` (lines ~305-319) already **auto-reads** `flashStore.read(req.raw)` and `share({ errors })` when `props.errors === undefined`. The read side of the flash loop exists; Piece 1 supplies the **write** side.
  - `InertiaService.location(url)` (line ~259) shows the 409/`X-Inertia-Location` vs 302 pattern and the `validateLocationUrl` open-redirect guard we reuse.
- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/interceptor/error-bag.interceptor.ts`
  - `ErrorBagInterceptor` reads `X-Inertia-Error-Bag` and nests `errors` under `{ [bag]: errors }`. It operates on the **happy-path response object**, not on exceptions. Piece 1's filter must apply the **same** namespacing on the redirect-back path. They are complementary, never both active for one response (see §4.4).
- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/interceptor/redirect.interceptor.ts`
  - `RedirectInterceptor` already upgrades 302→303 for Inertia `PUT/PATCH/DELETE`, with cross-runtime `getHeader(req, name)` (Express `req.header` vs raw Fastify `req.headers[lower]`). Reuse `getHeader` and the `autoUpgrade303` gate semantics.
- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/module.ts` (lines ~98-110)
  - Interceptors are registered as `APP_INTERCEPTOR` providers in `buildModuleProviders()`. Piece 1's filter wires in here as an `APP_FILTER` (opt-in).
- `/home/dudousxd/personal/nestjs-inertia/packages/core/src/types.ts`
  - `InertiaModuleOptions { flashStore?: FlashStore; autoUpgrade303?; ... }`. New options land here.
- `/home/dudousxd/personal/nestjs-inertia/packages/client/src/contract/contract-validation.pipe.ts`
  - `ContractValidationPipe` throws `BadRequestException({ message: 'Contract validation failed', issues: ZodIssue[] })`. The filter must recognize this shape **and** plain `ValidationPipe` (class-validator) shape.
- `/home/dudousxd/personal/nestjs-inertia/packages/client/src/contract/contract.ts`
  - `defineContract({ query?, body?, response, params?, error? })` — Zod already first-class in contracts.
- `/home/dudousxd/personal/nestjs-inertia/packages/codegen/src/discovery/contracts-fast.ts`
  - `extractDtoContract()`, `parseDefineContractCall()`, `zodAstToTs()`, `tryResolveTypeRef()`. This is where we add **class-validator decorator extraction** and **zod-AST capture** (see §5).
- `/home/dudousxd/personal/nestjs-inertia/packages/codegen/src/emit/emit-api.ts` + `/home/dudousxd/personal/nestjs-inertia/packages/codegen/src/generate.ts`
  - `emitApi()` produces `api.ts` (TanStack `mutationOptions`, the `ApiRouter` type, `Route`/`Path` namespaces). New `emitForms()` slots into `generate()` next to `emitApi()`.
- `/home/dudousxd/personal/nestjs-inertia/packages/client/src/fetcher/fetcher.ts`
  - `createFetcher()` already handles `FormData` (skips Content-Type) and JSON. The hook submits through Inertia's `router`, not the fetcher, but the FormData behavior informs §7.1.

Versions: zod peer is `^3.22.0` (client). RHF is **new** dependency — added as a peer of a new submodule (§3.4).

---

## 1. Architecture & data flow

### 1.1 The shared error-key contract

Define one canonical rule, documented and enforced on both ends:

> **Error keys are dot/bracket JSON paths to the offending field, rooted at the validated DTO.**
> Scalars: `email`. Nested object: `address.city`. Array element: `items.0.qty` (or `items[0].qty` — we pick **dot-with-numeric-index** `items.0.qty` because that is what `class-validator` + `class-transformer` produce in `ValidationError.children` and what RHF accepts via `setError('items.0.qty', …)`).

Both pieces converge on this:

- **Server** (Piece 1) flattens nested `ValidationError[]` / `ZodIssue[].path` into `items.0.qty` keys → `FlashErrors`.
- **Client** (Piece 2): RHF field names registered by `useInertiaForm` are the same paths; zod `flatten`/`setError` use them too. Merge is a trivial `Object.entries(serverErrors).forEach(([k,v]) => setError(k, …))`.

### 1.2 End-to-end data flow

```
┌─────────────────────────────────── BROWSER (React) ──────────────────────────────────┐
│ <form onSubmit={handleSubmit(onValid)}>                                                │
│   register('email') …                                                                  │
│                                                                                        │
│  (1) submit → RHF runs zodResolver(LoginBodySchema)                                     │
│        ├─ invalid → RHF errors{} populated, NO network. Stop.                           │
│        └─ valid   → (2) onValid(values)                                                 │
│                          router.post(route('auth.login'), values, {                    │
│                            headers: { 'X-Inertia-Error-Bag': bag? },                    │
│                            onError: (bag) => mergeServerErrors(bag),  ◄── (8)           │
│                            onSuccess: () => form.reset(),                               │
│                          })                                                             │
└───────────────────────────────────────┬────────────────────────────────────────────┘
                                         │ POST /auth/login   X-Inertia: true
                                         ▼
┌─────────────────────────────────── NESTJS SERVER ────────────────────────────────────┐
│ (3) ValidationPipe / ContractValidationPipe validates body                             │
│        ├─ valid → controller runs → 302/303 redirect (RedirectInterceptor) → done       │
│        └─ invalid → throws BadRequestException                                          │
│                                                                                        │
│ (4) InertiaValidationFilter.catch(exception)                                            │
│        ├─ extractFieldErrors(exception)  → FlashErrors { email: '…', password: '…' }    │
│        ├─ applyErrorBagScope(req, errors) → { [bag]: errors } if X-Inertia-Error-Bag    │
│        ├─ flashStore.write(req.raw, errors)        ◄── writes the bag                    │
│        └─ redirectBack(req, res)  → 303 Location: <back>   (or 409 X-Inertia-Location)  │
└───────────────────────────────────────┬────────────────────────────────────────────┘
                                         │ 303 Location: /login   (Inertia follows it)
                                         ▼
┌──────────────────────── NESTJS SERVER (the GET it redirected to) ─────────────────────┐
│ (5) GET /login → controller calls inertia.render('Login', …)                            │
│ (6) service.render() reads flashStore.read(req.raw) → shares { errors }   ◄── EXISTING  │
│ (7) page.props.errors = { email:'…', password:'…' }  (or { [bag]: {…} })                 │
└───────────────────────────────────────┬────────────────────────────────────────────┘
                                         │ 200 page JSON
                                         ▼
        (8) Inertia merges props.errors → @inertiajs/react usePage().props.errors
            useInertiaForm watches it → setError() into RHF state → UI shows errors.
```

Steps (5)-(7) already work today. This spec adds (3-throw shape recognition), (4), and the entire client side (1,2,8). The contract in §1.1 is what makes (4)'s output line up with (8)'s consumer.

---

## 2. class-validator → zod mapping

### 2.1 Why we need it (and the precedence rule)

Two sources of truth can describe a DTO:

- **`defineContract` zod schemas** — already parsed by `zodAstToTs()`. Authoritative, hand-written zod.
- **class-validator decorators** on a DTO class — the common NestJS idiom (`@IsEmail()`, `@MinLength(8)`).

**Precedence (decided):**

1. If the route has a `defineContract` with a `body`/`query` zod schema → **reuse that schema verbatim** (re-export it; no translation, zero fidelity loss). This is the preferred path and we document it as the recommended way to get perfect client/server parity.
2. Else if the `@Body()`/`@Query()` param type is a **class-validator-decorated DTO class** → **translate decorators → zod** (best-effort, §2.2).
3. Else (plain interface/type, no decorators) → emit a **type-only** structural schema using `z.object({...}).passthrough()` derived from property types (no constraints), so the hook still type-checks but does no constraint validation. Marked with a `// no validation rules found` comment.

This makes the feature *additive*: contract users get perfect parity for free; class-validator users get translated rules; everyone else gets typing.

### 2.2 Decorator → zod table

Base type is inferred from the **TS property type** first (`string`→`z.string()`, `number`→`z.number()`, `boolean`→`z.boolean()`, `Date`→`z.coerce.date()`), then decorators **refine** it. `@IsString` etc. can override an ambiguous base.

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
| `@Matches(/re/)` | `.regex(/re/)` | copy the literal regex AST text |
| `@IsEnum(E)` | `z.enum([...E values])` or `z.nativeEnum(E)` | resolve enum members via existing `findType`/`enum` branch in `contracts-fast.ts` |
| `@IsIn([a,b])` | `z.enum(['a','b'])` (strings) / `z.union([z.literal(...)])` | reuse array-literal parsing |
| `@IsOptional()` | wrap `.optional()` | also relaxes the property to optional in TS |
| `@IsNotEmpty()` | `.min(1)` on string; `.refine(v=>v!=null)` general | |
| `@IsArray()` + `@ValidateNested({each:true})` + `@Type(()=>Child)` | `z.array(<ChildSchema>)` | recurse into `Child` DTO; emit `ChildSchema` as a named const |
| `@ValidateNested()` + `@Type(()=>Child)` (single) | `<ChildSchema>` | nested object |
| `@IsObject()` | `z.object({}).passthrough()` if no nested info | |
| `@Allow()` | `z.unknown()` | explicit allow |
| `@IsDefined()` | drop `.optional()` (required) | |

**Custom messages:** if a decorator carries `{ message: '…' }`, emit `{ message: '…' }` into the zod call (e.g. `.email({ message: 'Bad email' })`) so **client-side** messages match server messages. When `message` is a function, skip (can't serialize) and warn.

### 2.3 Unmappable validators

Policy: **skip + warn, never fail the build.**

- Unknown/custom decorators (`@IsStrongPassword`, app-specific `@IsUniqueEmail`) → **do not** narrow; keep the base type schema and append a comment `// @IsStrongPassword: not translatable to zod (server-only)`. Emit a single deduped `console.warn` per decorator name per run (consistent with the existing `console.warn` pattern in `contracts-fast.ts`).
- If the property has **only** unmappable decorators and an unknown TS type → `z.unknown()`.
- Async/DB validators are **server-only by nature** (e.g. uniqueness). They never get a client mirror; the server error still surfaces via the flash bag (Piece 1). Document this clearly: "client zod is a fast-feedback subset; the server remains authoritative."

### 2.4 Nesting / arrays / `@Type` / `@ValidateNested`

- Resolve nested DTO classes through the existing `findType()` / `resolveImportedType()` machinery in `contracts-fast.ts` (it already crosses files and tsconfig path aliases).
- Emit nested schemas as **named consts** hoisted above the parent (`const AddressSchema = z.object({…})`), then reference (`address: AddressSchema`). De-dupe by class name within a file; alias on collision (reuse the `emittedNames` alias trick in `emit-api.ts`).
- Recursion guard: reuse the `depth`/`visited` pattern already in `collectEntityFields()`. On cycle → `z.lazy(() => XSchema)`.
- Arrays: `@IsArray` + element decorators → `z.array(elementSchema)`; element constraints (`@ValidateNested({each:true})`) recurse.

---

## 3. The `useInertiaForm` API

### 3.1 Design goals

- One import, one call. Wraps `useForm` (RHF) with `zodResolver(schema)` pre-wired, plus Inertia submit + automatic server-error merge + reset-on-success.
- The generated schema and the route are passed in **by name** so the whole thing is typed off the codegen output.
- Does NOT reinvent RHF — returns the full RHF `form` object plus a thin `submit` helper.

### 3.2 Signature

```ts
// @dudousxd/nestjs-inertia-client/react  (new export)
import type { UseFormReturn, FieldValues, DefaultValues } from 'react-hook-form';
import type { ZodType } from 'zod';

export interface UseInertiaFormOptions<TValues extends FieldValues> {
  /** zod schema for the body (from generated forms.ts). */
  schema: ZodType<TValues>;
  /** Inertia endpoint URL (use route('auth.login')) or [method, url]. */
  action: string | { method: 'post' | 'put' | 'patch' | 'delete'; url: string };
  defaultValues?: DefaultValues<TValues>;
  /** Error bag name → sent as X-Inertia-Error-Bag and read back from props.errors[bag]. */
  errorBag?: string;
  /** Reset the form to defaultValues on successful submit. Default: false. */
  resetOnSuccess?: boolean;
  /** Inertia visit options passthrough (preserveScroll, preserveState, only, headers…). */
  visitOptions?: Record<string, unknown>;
  /** RHF mode etc. */
  formProps?: Parameters<typeof useForm<TValues>>[0];
}

export interface UseInertiaFormReturn<TValues extends FieldValues>
  extends UseFormReturn<TValues> {
  /** RHF-wrapped submit. Validates client-side, then Inertia-visits. */
  submit: ReturnType<UseFormReturn<TValues>['handleSubmit']>;
  /** True while the Inertia visit is in flight (mirrors RHF isSubmitting). */
  isSubmitting: boolean;
  /** Server-only / non-field error message, if any (from errors._ or top-level). */
  formError: string | undefined;
}

export function useInertiaForm<TValues extends FieldValues>(
  options: UseInertiaFormOptions<TValues>,
): UseInertiaFormReturn<TValues>;
```

### 3.3 Behavior (return-shape contract)

- `register`, `control`, `formState.errors`, `watch`, `setValue`, `reset` — straight from RHF.
- `submit` = `handleSubmit(values => router[method](url, values, visit))`. Client-side zod runs first (via `zodResolver`); on failure no network call.
- **Server-error merge**: the hook subscribes to `usePage().props.errors` (`@inertiajs/react`). On change, it diffs against current RHF errors and calls `setError(path, { type: 'server', message })` for each key (scoped to `errorBag` if set). Keys not in the form are aggregated into `formError`. Cleared on next successful submit or `clearErrors()`.
  - Implementation detail: use a `useEffect([pageErrors])` that maps `Object.entries(scopedErrors)`; guard against loops by tagging server errors with `type: 'server'` and only re-applying when the page-error object identity changes.
- **`isSubmitting`**: OR of RHF `formState.isSubmitting` and an internal Inertia `processing` flag set in `onStart`/`onFinish`.
- **`resetOnSuccess`**: on Inertia `onSuccess`, call `form.reset(defaultValues)`.
- **CSRF**: the hook does not manage CSRF tokens itself; Inertia's `router` carries the XSRF cookie/header per `@inertiajs` conventions; the existing core CSRF guard (`packages/core/src/csrf/csrf.guard.ts`) validates. See §7.4.

### 3.4 Packaging

- New entry `@dudousxd/nestjs-inertia-client/react-form` (or fold into `/react`). Prefer a **separate subpath** so non-RHF users don't pull RHF.
  - Add to `packages/client/package.json` `exports` a `./react-form` block mirroring the existing `./react` block.
  - Add peers: `react-hook-form` `^7.50.0`, `@hookform/resolvers` `^3.3.0`, marked `peerDependenciesMeta.optional = true` (consistent with how `@inertiajs/*` are optional peers today).
- Vue/Svelte get the schema only (§6); no hook in v1.

### 3.5 Before / after

**Before (today — manual):**

```tsx
// Login.tsx — current reality
import { useForm } from '@inertiajs/react';

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({ email: '', password: '' });
  function submit(e) {
    e.preventDefault();
    post('/auth/login'); // no client validation; errors only appear after round-trip
  }
  return (
    <form onSubmit={submit}>
      <input value={data.email} onChange={e => setData('email', e.target.value)} />
      {errors.email && <span>{errors.email}</span>}
      <input type="password" value={data.password}
             onChange={e => setData('password', e.target.value)} />
      {errors.password && <span>{errors.password}</span>}
      <button disabled={processing}>Log in</button>
    </form>
  );
}
```

Problems: no client-side validation (every typo is a round-trip), `email`/`password` strings are stringly-typed, zero parity with server rules, server error wiring is implicit-and-fragile.

**After (with this feature):**

```tsx
// Login.tsx
import { useInertiaForm } from '@dudousxd/nestjs-inertia-client/react-form';
import { route } from '@/.nestjs-inertia';
import { LoginBodySchema, type LoginBody } from '@/.nestjs-inertia/forms';

export default function Login() {
  const { register, submit, formState: { errors }, isSubmitting } =
    useInertiaForm<LoginBody>({
      schema: LoginBodySchema,
      action: { method: 'post', url: route('auth.login') },
      defaultValues: { email: '', password: '' },
      resetOnSuccess: false,
    });

  return (
    <form onSubmit={submit}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}   {/* client OR server */}
      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
      <button disabled={isSubmitting}>Log in</button>
    </form>
  );
}
```

`LoginBodySchema` is generated; `LoginBody` is `z.infer`. `errors.email.message` now carries either the client zod message (instant) or the server message (round-trip) — same field, same display code.

---

## 4. Server filter design (`InertiaValidationFilter`)

### 4.1 Responsibilities

A NestJS `@Catch(BadRequestException)` `ExceptionFilter` that:

1. Decides if the exception is a **validation** failure it should handle (else rethrow / delegate).
2. Extracts field-keyed messages → `FlashErrors`.
3. Applies error-bag scoping.
4. `flashStore.write(req.raw, errors)`.
5. Redirects back (303 / 409) to the originating page.

It only activates for **Inertia requests** (`getHeader(req,'X-Inertia')` truthy) on **non-GET** methods. Non-Inertia or GET → rethrow so normal Nest error handling (JSON 400) applies. This preserves API clients.

### 4.2 Recognizing validation failures

Handle these response shapes (NestJS `BadRequestException.getResponse()`):

- **class-validator `ValidationPipe`** (default): `{ statusCode:400, message: string[], error:'Bad Request' }` — but the default `message: string[]` is *flat strings*, not field-keyed. To get field keys we require `ValidationPipe({ exceptionFactory })` OR we parse with a heuristic. **Decision:** ship a small **`inertiaValidationExceptionFactory`** helper that users plug into their `ValidationPipe` (`new ValidationPipe({ exceptionFactory: inertiaValidationExceptionFactory })`). It maps `ValidationError[]` → a structured payload `{ __inertiaErrors: FlashErrors }` the filter reads directly. This is the "dedicated path" — lossless field keys including nested `children`.
  - Without the factory, fall back to a best-effort parse of `message: string[]` where each string starts with the property name (class-validator default messages do: `"email must be an email"`); split on first space, use leading token as the key. Lossy but works for flat DTOs. Documented as the lesser path.
- **`ContractValidationPipe`** (our own, `contract-validation.pipe.ts`): `{ message:'Contract validation failed', issues: ZodIssue[] }`. Map each issue: key = `issue.path.join('.')` (→ `items.0.qty`), value = `issue.message`. **First-wins** per key (or join messages — config, default first-wins).
- **Raw zod** thrown anywhere and caught: same `issues` mapping. Add a secondary `@Catch(ZodError)` registration when the zod error escapes a pipe.

Extraction lives in a pure, unit-testable function:

```ts
// packages/core/src/validation/extract-field-errors.ts
export function extractFieldErrors(exception: unknown): FlashErrors | null;
// returns null when the exception is not a recognized validation failure
```

### 4.3 Redirect-back target resolution

Priority order (first present wins):

1. **`X-Inertia-Referer`** if a future client sets it (explicit, tamper-aware) — reserved, optional.
2. **`Referer` header** — the canonical Inertia/Laravel approach. The SPA always sends `Referer` of the current page on POST.
3. **Configured fallback** `validation.fallbackRedirect` (default `'/'`).

Resolved URL passes through the existing `validateLocationUrl` guard (open-redirect protection) reused from `service.ts`. For safety, **strip to path+query of same-origin only**; reject cross-origin Referer (fall to fallback).

Emit, mirroring `InertiaService.location()`:

- Inertia XHR (`X-Inertia` present): `res.status(303)` + `Location: <back>`. Inertia v2 follows 303 on the same visit and issues a GET. (We use 303, not 409; 409 is for *asset-version* location swaps. A validation redirect-back is a normal same-page reload, so 303 Location is correct and is exactly what Laravel does.)
- Non-Inertia (hard navigation, rare for POST): `res.status(303)` + `Location` too.

Cross-runtime status/header/redirect via the **same `getHeader` helper** and a small `sendRedirect(res, 303, url)` that handles Express (`res.redirect`/`res.status().setHeader().end()`) vs Fastify (`reply.code().header().send()`), modeled on `service.ts`'s direct `res.status().setHeader().end()` usage (which already works in both adapters per the adapter layer).

### 4.4 Interaction with existing interceptors

- **`ErrorBagInterceptor`** (`error-bag.interceptor.ts`) only rewrites *successful response objects* that carry `errors`. On the validation-failure path the controller **never returns** — it throws — so the interceptor's `map` never sees a value. Therefore the **filter** must replicate the bag-nesting itself:

  ```ts
  const bag = getHeader(req, 'X-Inertia-Error-Bag');
  const scoped = bag ? { [bag]: errors } : errors;
  await flashStore.write(req.raw, scoped);
  ```

  And the GET-side read (`service.render`) shares it untouched, so `props.errors = { [bag]: {…} }` matches what `ErrorBagInterceptor` would have produced on a happy path. **Symmetry guaranteed by construction.**
- **`RedirectInterceptor`**: it upgrades 302→303 for safe methods. Our filter sets 303 directly, so no double-handling. But note the filter runs on POST too (interceptor only patches PUT/PATCH/DELETE); the filter owns POST redirects entirely. No conflict — filters run after interceptors in Nest's pipeline and short-circuit the response.

### 4.5 Opt-in surface

Three ways, increasing globalness:

1. **Module option (recommended):**
   ```ts
   InertiaModule.forRoot({
     flashStore: mySessionFlashStore,
     validation: {
       enabled: true,                 // default false (additive / non-breaking)
       fallbackRedirect: '/',
       mergeMessages: 'first',        // 'first' | 'join'
     },
   })
   ```
   When `validation.enabled` and a `flashStore` is configured, `buildModuleProviders()` pushes `{ provide: APP_FILTER, useClass: InertiaValidationFilter }`. Requires `flashStore` (throw a clear bootstrap error if `validation.enabled` without `flashStore` — write has nowhere to go).
2. **Manual global**: `app.useGlobalFilters(new InertiaValidationFilter(deps))` for users not using `forRoot` filter injection. Exported from `@dudousxd/nestjs-inertia`.
3. **Per-controller**: `@UseFilters(InertiaValidationFilter)`.

New types in `packages/core/src/types.ts`:

```ts
export interface InertiaValidationOptions {
  enabled?: boolean;             // default false
  fallbackRedirect?: string;     // default '/'
  mergeMessages?: 'first' | 'join'; // default 'first'
}
export interface InertiaModuleOptions {
  // …existing…
  validation?: InertiaValidationOptions;
}
```

### 4.6 Fastify + Express parity

- Header reads: `getHeader(req, name)` (already cross-runtime in `redirect.interceptor.ts`).
- Redirect/write: `service.ts` already calls `res.status(n).setHeader(k,v).end()` across both adapters successfully (it does so for `location()`), so the filter uses the same `InertiaResponse` abstraction by resolving it from the adapter host. Where the filter has only the raw platform response (in `catch`), wrap with the same adapter helpers used in `module.ts`/`adapter`. Add e2e coverage for both (mirrors existing `adapter.express.spec.ts` / `adapter.fastify.spec.ts`).
- Session flash store is user-provided; the filter is store-agnostic (calls `write`). Document an `express-session`-backed example `FlashStore` and a Fastify `@fastify/session` one.

---

## 5. Codegen emit

### 5.1 New artifact: `forms.ts`

A new emitter `packages/codegen/src/emit/emit-forms.ts`, called from `generate.ts` after `emitApi()`, gated on "there exists ≥1 contracted route with a body or query schema/DTO and `config.forms.enabled !== false`". Output file: `<outDir>/forms.ts`.

Contents per route that has a validatable body (and optionally query):

```ts
// Generated by @dudousxd/nestjs-inertia-codegen. Do not edit.
import { z } from 'zod';

// auth.login
export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

// nested example
const AddressSchema = z.object({ city: z.string().min(1), zip: z.string().regex(/^\d{5}$/) });
export const SignupBodySchema = z.object({
  name: z.string().min(1),
  address: AddressSchema,
  tags: z.array(z.string()).optional(),
});
export type SignupBody = z.infer<typeof SignupBodySchema>;

// Name→schema map for useInertiaForm-by-name ergonomics (optional).
export const formSchemas = {
  'auth.login': LoginBodySchema,
  'auth.signup': SignupBodySchema,
} as const;
```

**Naming:** `<PascalRouteName>BodySchema` / `<…>QuerySchema`, where PascalRouteName is the dot-name camelCased+capitalized (`auth.login` → `Login`; collisions across controllers resolved by including the class segment: `Auth` + `Login` → `AuthLogin` only on collision, reusing emit-api's alias approach). `z.infer` type alias `<…>Body`.

### 5.2 Where the schema text comes from

Extend `contracts-fast.ts`:

- **Path A (contract reuse):** when a `defineContract` `body`/`query` exists, we currently call `zodAstToTs()` (which lowers zod→TS). Add a parallel capture that **keeps the raw zod source text** (`node.getText()`) for the `body`/`query` initializer, plus the file path of the source so `forms.ts` can either (a) **re-export** the existing schema by importing it (best — single source) or (b) inline the text. **Decision: re-export when the schema is a named/importable const; inline the `.getText()` otherwise.** Add `bodyZodRef?: { name; filePath } | null` and `bodyZodText?: string | null` to `ContractSource` (`discovery/types.ts`).
- **Path B (class-validator DTO):** new `extractZodFromDto(classDecl, sourceFile, project)` that walks `getProperties()`, reads each property's decorators (`prop.getDecorators()`), and applies the §2.2 table to build a zod source string. Reuses `findType`/enum-resolution already present. Returns `{ schemaText, namedNestedSchemas: Map<name, text>, warnings: string[] }`.
- Decorator metadata extraction is **pure AST** (ts-morph) — no need to import class-validator. We read decorator names + literal args from the AST, exactly like the existing `@ApplyFilter`/`@Filterable` extraction in `contracts-fast.ts` does.

### 5.3 RouteDescriptor additions

`ContractSource` (in `discovery/types.ts`) gains:

```ts
bodyZodText?: string | null;   // raw zod source for body (Path A) or synthesized (Path B)
bodyZodRef?: TypeRef | null;   // importable named schema to re-export (Path A)
queryZodText?: string | null;
queryZodRef?: TypeRef | null;
formWarnings?: string[];       // unmappable decorators, surfaced to console + a header comment
```

### 5.4 Index + exports

- `emit-index.ts`: add `export * from './forms.js';` when forms were emitted (new `hasForms` flag through `generate()` like the existing `hasContracts`).
- `forms.ts` imports only `zod` (framework-agnostic — see §6).

### 5.5 Watch-mode

- `watch/watcher.ts` already re-runs `generate()` on controller changes (the contracts glob). Since DTO classes can live in `*.dto.ts` (not matched by `*.controller.ts`), **extend the watch glob** to also include DTO files referenced by contracts. Pragmatic v1: add a config `forms.watch` glob (default `'src/**/*.dto.ts'`) merged into the watcher's watched set; on any match, debounce + full `generate()`. Reuse the existing `debounceMs`.
- Determinism for snapshot tests: sort properties in source order; stable nested-schema hoist order (topological by dependency, then alphabetical).

### 5.6 Config

`UserConfig` (in `config/types.ts`) gains:

```ts
forms?: {
  enabled?: boolean;       // default true when any validatable body exists
  watch?: string;          // dto glob, default 'src/**/*.dto.ts'
  zodImport?: string;      // default 'zod'
};
```

---

## 6. Vue / Svelte

RHF is React-only. The **schema is the portable asset**; the hook is React-only for v1.

- `forms.ts` imports only `zod` → directly consumable in Vue and Svelte. Document patterns:
  - **Vue:** pair `LoginBodySchema` with `@vee-validate/zod`'s `toTypedSchema(LoginBodySchema)` + `useForm` (vee-validate), or validate manually with `safeParse` on submit and feed errors to Inertia's `useForm`. Server errors still arrive via `usePage().props.errors` (same key contract) — show them the same way.
  - **Svelte:** pair with `sveltekit-superforms`/`zod` or a manual `safeParse`. Same server-error path.
- **Documented path for parity hooks (v2):** mirror `useInertiaForm` as `useInertiaForm` in `@dudousxd/nestjs-inertia-client/vue` (over vee-validate) and a Svelte action/store (over felte or manual). The **server-error-merge contract** (read `props.errors[bag]`, set field errors by path) is framework-agnostic and is the only nontrivial shared logic — extract it into a tiny framework-free helper `mergeServerErrors(pageErrors, bag, setError)` in `client/src/shared/` so all three frameworks reuse it.
- The **error-key contract (§1.1) is the cross-framework guarantee**: regardless of form lib, server keys map onto field paths.

---

## 7. Edge cases

### 7.1 File uploads / FormData

- zod can't validate a real `File` deeply on the client, but can assert presence/type: emit `z.instanceof(File)` (or `z.custom<File>()`) for properties typed `Express.Multer.File` / `File` / decorated with multipart markers. Multiple files → `z.array(z.instanceof(File))`.
- `useInertiaForm` must detect `File`/`FileList` in values and submit as **FormData** (Inertia's `router` auto-converts when it sees files; also `forceFormData` option exposed via `visitOptions`). The fetcher's existing FormData handling (`fetcher.ts isFormData`) is the reference for "don't set Content-Type."
- Server-side file validation (size/mime) stays server-only; errors flash back keyed by field (`avatar`). Document `@MaxFileSize`-style custom validators as untranslatable (§2.3).

### 7.2 Array fields

- Schema: `z.array(...)` (§2.4). RHF `useFieldArray` works against `items` path. Server keys `items.0.qty` align with RHF nested array field names — **the index-numeric dot path is the linchpin** (§1.1). Verify in tests that class-validator's `children` flattening produces `items.0.qty` (it produces `property:'0'` nesting under `items`).

### 7.3 Conditional validation

- class-validator `@ValidateIf(cond)` is a **function** → untranslatable; skip + warn. Recommend users author a `defineContract` zod with `.refine`/`.superRefine`/discriminated unions for conditional logic (Path A reuse preserves it perfectly). This is a strong argument for the contract-first path.
- zod `.refine`/`.superRefine` from contracts carry over verbatim (we re-export, §5.2 Path A).

### 7.4 CSRF token inclusion

- Inertia's `router` automatically sends the `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` header; core's `csrf.guard.ts` + `csrf-cookie.interceptor.ts` validate it. `useInertiaForm` adds nothing here — it delegates to `router`. Document: ensure `InertiaRouteProvider`/CSRF cookie interceptor is active. For manual fetcher-based submits (not the hook), users add the header via the provider's `headers` callback (`provider.tsx setGlobalHeaders`).

### 7.5 Optimistic UI

- The hook does not do optimistic mutation (that's TanStack's `mutationOptions` territory in `api.ts`). For optimistic flows, users keep using `api.<route>.mutationOptions()`; `useInertiaForm` is for the **page-form** (server-redirect) idiom. Document the two lanes: *forms → `useInertiaForm` (redirect-back)*, *data mutations → TanStack `mutationOptions` (JSON)*. They share the generated zod schema (the schema can be imported into either).

### 7.6 Multi-error-bag pages

- Two forms on one page → each `useInertiaForm({ errorBag: 'create' })` / `{ errorBag: 'edit' }`. Each sends `X-Inertia-Error-Bag`, the filter scopes the write (`{ create: {…} }`), `props.errors` becomes `{ create: {…}, edit: {…} }`, and each hook reads only its own bag. This is exactly the `ErrorBagInterceptor` semantics, now symmetric on the failure path (§4.4). Without `errorBag`, errors are top-level (single-form page).

---

## 8. Implementation phases (independently shippable)

**Phase 1 — Server filter (no client changes).** Ship `extractFieldErrors`, `InertiaValidationFilter`, `inertiaValidationExceptionFactory`, `InertiaValidationOptions`, module wiring (`APP_FILTER` opt-in), Express+Fastify redirect-back. Value immediately even with hand-written forms: errors auto-flash + redirect-back. Read side already exists in `service.render`. *Self-contained; e2e against examples.*

**Phase 2 — zod emit (Path A: contract reuse).** Capture `bodyZodRef`/`bodyZodText` for `defineContract` bodies; emit `forms.ts` (re-export named schemas); index export; config `forms`. No RHF yet — schemas usable standalone. *Snapshot tests on `forms.ts`.*

**Phase 3 — zod emit (Path B: class-validator → zod).** `extractZodFromDto` + the §2.2 table + nested/array + warnings. *Heavy snapshot coverage.*

**Phase 4 — React hook.** `useInertiaForm` + `mergeServerErrors` shared helper + `/react-form` subpath + peers. *RHF unit/integration tests.*

**Phase 5 — Watch-mode DTO globs + docs + Vue/Svelte schema patterns.** Extend watcher, document framework recipes, ship example apps wired end-to-end (`examples/express-react` is the natural home; `users.controller.ts` + a `LoginDto`).

Phases 1 and 2 are orthogonal and can land in either order; 3 depends on 2's emit scaffold; 4 depends on 2 (needs at least one emitted schema). Each is releasable.

---

## 9. Testing

### 9.1 Server filter (core)

- **Unit** `extractFieldErrors`: class-validator factory payload (nested `children` → `items.0.qty`), `ContractValidationPipe` `issues`, raw `ZodError`, flat `message: string[]` heuristic, non-validation `BadRequestException` → `null` (rethrow).
- **e2e** (mirror `adapter.express.spec.ts` / `adapter.fastify.spec.ts`): POST invalid body with `X-Inertia` → assert `flashStore.write` called with field-keyed errors, response is **303** with `Location` = `Referer`, then GET that location → `props.errors` populated. Error-bag variant asserts `{ [bag]: {…} }`. Non-Inertia request → normal 400 JSON (filter rethrows). Open-redirect Referer → fallback. Both runtimes.
- **Interaction**: confirm filter doesn't double-fire with `RedirectInterceptor`; confirm symmetry with `ErrorBagInterceptor` (same `props.errors` shape on success vs failure).

### 9.2 Codegen (snapshot)

- New `packages/codegen/test/emit-forms.spec.ts`: feed fixture controllers/DTOs through discovery → assert exact `forms.ts` text. Cases: contract reuse (re-export), each §2.2 decorator, `@IsOptional`, `@IsEnum` (enum resolution), nested `@ValidateNested`/`@Type`, array-of-nested, custom `{ message }`, unmappable decorator (warn + comment + base type), name-collision aliasing, recursion → `z.lazy`. Deterministic ordering assertions.
- Extend `discovery` tests for new `extractZodFromDto` + `bodyZodRef` capture.

### 9.3 RHF hook (client)

- `useInertiaForm`: client zod invalid → no `router` call, `errors` populated; valid → `router[method]` called with values + headers (`X-Inertia-Error-Bag` when set). Mock `usePage().props.errors` change → `setError` applied to right paths, scoped by bag; extra keys → `formError`. `resetOnSuccess` resets on `onSuccess`. `isSubmitting` toggles around `onStart`/`onFinish`. `mergeServerErrors` pure-unit tests (framework-free).

---

## 10. Open decisions (resolved here, flagged for review)

1. **303 vs 409 for redirect-back** → **303 + Location** (Laravel parity; 409 reserved for asset-version swaps). *(§4.3)*
2. **Field-key format** → **dot with numeric index** `items.0.qty` (class-validator + RHF native). *(§1.1)*
3. **Contract zod vs translated zod** → **both, contract-first precedence**; re-export contract schemas, translate decorators only when no contract. *(§2.1)*
4. **Lossy `message: string[]` parse** kept as a fallback but the **`exceptionFactory` is the blessed path**. *(§4.2)*
5. **Separate `/react-form` subpath** to keep RHF out of non-form bundles; RHF as optional peer. *(§3.4)*
6. **`validation.enabled` defaults false** (additive/non-breaking); throws if enabled without a `flashStore`. *(§4.5)*
