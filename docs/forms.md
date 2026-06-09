# Complete Forms Story — Typed Forms + Automatic Validation

`nestjs-inertia` makes forms feel like Laravel/Inertia: validation failures
auto-flash a field-keyed error bag and redirect back, and the client gets a
typed `useInertiaForm` hook whose zod schema is generated from your server
contracts/DTOs. The unifying invariant is the **shared error-key contract**: the
key the server flashes (`email`, `address.city`, `items.0.qty`) is byte-identical
to the React Hook Form field path.

## 1. Server: automatic validation error handling

Enable the `InertiaValidationFilter` in `forRoot`. It requires a `flashStore`.

```ts
InertiaModule.forRoot({
  flashStore: sessionFlashStore,        // see §5 for express-session / @fastify/session
  validation: {
    enabled: true,                      // default false (additive / non-breaking)
    fallbackRedirect: '/',              // when no Referer is present
    mergeMessages: 'first',             // 'first' | 'join'
  },
});
```

On an Inertia non-GET request, when validation throws a `BadRequestException`,
the filter:

1. extracts field-keyed messages → `FlashErrors`,
2. scopes them under `X-Inertia-Error-Bag` if set,
3. `flashStore.write(req, errors)`,
4. emits `303 Location: <Referer | fallback>` (same-origin only — open-redirect
   guarded).

The GET it redirects to reads the flash via `service.render()` and shares
`props.errors`. Non-Inertia or GET requests are rethrown → normal JSON 400.

### Getting field-keyed errors

For lossless, nested field keys (`items.0.qty`), plug the blessed factory into
your `ValidationPipe`:

```ts
import { inertiaValidationExceptionFactory } from '@dudousxd/nestjs-inertia';

app.useGlobalPipes(new ValidationPipe({ exceptionFactory: inertiaValidationExceptionFactory }));
```

`extractFieldErrors` also recognizes `ContractValidationPipe` issues, raw
`ZodError`s, and (lossily) the flat class-validator `message: string[]`.

## 2. Codegen: generated zod schemas (`forms.ts`)

`nestjs-inertia codegen` emits `forms.ts` with one zod schema per validated
endpoint, plus a `formSchemas` name→schema map and `z.infer` type aliases.

- **Contract reuse (Path A):** `defineContract` `body`/`query` schemas are
  emitted verbatim (inlined zod text — kept client-safe so no server deps leak
  into the bundle). Perfect client/server parity.
- **class-validator (Path B):** decorated DTO classes are translated to zod via
  pure AST reading (`@IsEmail()` → `.email()`, `@MinLength(8)` → `.min(8)`,
  `@ValidateNested` + `@Type` → hoisted nested schemas, etc.). Unmappable
  decorators (`@IsStrongPassword`, custom validators) are skipped with a warning
  and a `// not translatable` comment — the server stays authoritative.
- **Plain types:** structural type-only schemas.

Config (`nestjs-inertia.config.ts`):

```ts
forms: {
  enabled: true,                // default true when a validatable body exists
  watch: 'src/**/*.dto.ts',     // DTO glob watched for regen
  zodImport: 'zod',
}
```

## 3. React: `useInertiaForm`

Install the optional peers and import from the `./react-form` subpath:

```sh
pnpm add react-hook-form @hookform/resolvers
```

```tsx
import { useInertiaForm } from '@dudousxd/nestjs-inertia-client/react-form';
import { LoginBodySchema, type LoginBody } from '@/.nestjs-inertia/forms';

export default function Login() {
  const { register, submit, formState: { errors }, isSubmitting, formError } =
    useInertiaForm<LoginBody>({
      schema: LoginBodySchema,
      action: { method: 'post', url: route('auth.login') },
      defaultValues: { email: '', password: '' },
      // errorBag: 'login',          // multi-form pages — sends X-Inertia-Error-Bag
      // resetOnSuccess: true,
    });

  return (
    <form onSubmit={submit}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}   {/* client OR server */}
      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
      {formError && <p role="alert">{formError}</p>}
      <button disabled={isSubmitting}>Log in</button>
    </form>
  );
}
```

Client-side zod runs first (no network on failure). On a valid submit it
Inertia-visits; server errors arrive via `usePage().props.errors` and are merged
back into the same RHF error state (`errors.email.message` shows either the
instant client message or the round-trip server message). `formError` aggregates
non-field / `_` / unknown keys.

`react-hook-form` and `@hookform/resolvers` are optional peers reachable **only**
through `./react-form` — the base `.` and `./react` bundles never pull them.

## 4. Two lanes

- **Page forms (redirect-back):** `useInertiaForm`. The server is authoritative;
  errors flash + redirect.
- **Data mutations (JSON):** TanStack `api.<route>.mutationOptions()` from
  `api.ts`. Both lanes can import the same generated zod schema.

CSRF: `useInertiaForm` delegates to Inertia's `router`, which carries the
`XSRF-TOKEN`; the core CSRF guard validates it. Files/`FileList` in values are
auto-converted to `FormData` by `router` (expose `forceFormData` via
`visitOptions` if needed).

## 5. FlashStore examples

The filter is store-agnostic — it calls `write(req, errors)` and the read side
calls `read(req)`. Use a session-backed store for redirect-back persistence.

**express-session:**

```ts
import type { FlashErrors, FlashStore } from '@dudousxd/nestjs-inertia';
import type { Request } from 'express';

export const sessionFlashStore: FlashStore = {
  read(req) {
    const s = (req as Request).session as { __inertiaErrors?: FlashErrors };
    const errors = s?.__inertiaErrors ?? {};
    if (s) s.__inertiaErrors = undefined; // flash: consume once
    return errors;
  },
  write(req, errors) {
    const s = (req as Request).session as { __inertiaErrors?: FlashErrors };
    if (s) s.__inertiaErrors = errors;
  },
};
```

**@fastify/session:** identical shape — read/write `req.session.__inertiaErrors`
(register `@fastify/session` + `@fastify/cookie`). The filter passes `req.raw`
under Fastify so the session is reachable.

## 6. Vue / Svelte

The generated `forms.ts` imports only `zod`, so the schema is portable. The hook
is React-only in v1; Vue/Svelte consume the same schema and the framework-free
`mergeServerErrors(pageErrors, bag, setError, knownFields)` helper (exported from
`./react-form`, framework-agnostic).

- **Vue:** `@vee-validate/zod`'s `toTypedSchema(LoginBodySchema)` + vee-validate
  `useForm`, or a manual `safeParse` on submit feeding Inertia's `useForm`.
  Server errors via `usePage().props.errors` using the same key contract.
- **Svelte:** `sveltekit-superforms` / manual `safeParse`. Same server-error path.

## 7. Multi-error-bag pages

Two forms on one page → `useInertiaForm({ errorBag: 'create' })` /
`{ errorBag: 'edit' }`. Each sends `X-Inertia-Error-Bag`; the filter scopes the
write (`{ create: {…} }`), `props.errors` becomes `{ create: {…}, edit: {…} }`,
and each hook reads only its own bag.
