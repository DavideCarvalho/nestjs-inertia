# Forms Story — Typed Schemas + Automatic Validation

`nestjs-inertia` makes forms feel like Laravel/Inertia: validation failures
auto-flash a field-keyed error bag and redirect back, and the codegen generates a
zod schema per validated endpoint from your server contracts/DTOs. The unifying
invariant is the **shared error-key contract**: the key the server flashes
(`email`, `address.city`, `items.0.qty`) is byte-identical to the field path you
register on the client.

The client form wiring itself is left to you — bring your own form library (e.g.
react-hook-form) and submission lane, and validate against the generated zod
schema. The two pieces this library provides are (1) the generated schemas and
(2) the server-side validation filter.

## 1. Server: automatic validation error handling

Enable the `InertiaValidationFilter` in `forRoot`. It requires a `flashStore`.

```ts
InertiaModule.forRoot({
  flashStore: sessionFlashStore,        // see §4 for express-session / @fastify/session
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

The generated `forms.ts` imports only `zod`, so the schema is portable across
React, Vue, and Svelte.

## 3. Wiring a form on the client

The generated schema is framework-agnostic — feed it into whatever form library
you use. The contract you must honour is the **shared error-key contract**: the
field paths you register must match the keys the server flashes, so server errors
from `usePage().props.errors` can be merged into your form's error state.

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, usePage } from '@inertiajs/react';
import { LoginBodySchema, type LoginBody } from '@/.nestjs-inertia/forms';

export default function Login() {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<LoginBody>({ resolver: zodResolver(LoginBodySchema) });

  const onSubmit = handleSubmit((values) => {
    // Inertia visit; the server is authoritative and flashes errors on failure.
    router.post('/auth/login', values);
  });

  // Merge server-flashed errors back into the form by their (matching) keys.
  const page = usePage();
  for (const [field, message] of Object.entries(page.props.errors ?? {})) {
    setError(field as keyof LoginBody, { type: 'server', message: String(message) });
  }

  return (
    <form onSubmit={onSubmit}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
      <button disabled={isSubmitting}>Log in</button>
    </form>
  );
}
```

Two lanes share the same generated schema:

- **Page forms (redirect-back):** Inertia `router` visit. The server is
  authoritative; errors flash + redirect.
- **Data mutations (JSON):** TanStack `api.<route>.mutationOptions()` from
  `api.ts`.

CSRF: Inertia's `router` carries the `XSRF-TOKEN`; the core CSRF guard validates
it. Files/`FileList` in values are auto-converted to `FormData` by `router`.

For multi-form pages, send `X-Inertia-Error-Bag` on the visit; the filter scopes
the write (`{ create: {…} }`), `props.errors` becomes
`{ create: {…}, edit: {…} }`, and each form reads only its own bag.

## 4. FlashStore examples

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
