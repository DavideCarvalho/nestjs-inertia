---
name: inertia-forms-validation
description: >-
  Laravel-style form validation and flash messages for @dudousxd/nestjs-inertia.
  Covers the FlashStore adapter contract (read/write/readFlash/writeFlash),
  InertiaValidationFilter (auto field-keyed error bag + 303 redirect-back),
  validation forRoot options (enabled/fallbackRedirect/mergeMessages),
  inertiaValidationExceptionFactory for nested field keys, InertiaService.flash
  for general messages, and InertiaService.location for open-redirect-safe
  external redirects. Use when wiring validation errors, flash, or error bags.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-inertia"
  library_version: 1.8.0
  framework: nestjs
---

# Inertia forms, validation & flash

NestJS has no session of its own, so this library externalizes flash state behind
a `FlashStore` you implement against your session. With validation enabled, a
`BadRequestException` on an Inertia non-GET request is turned into a field-keyed
error bag, flashed, and 303-redirected back — the redirected GET then surfaces it
as `props.errors`.

## Setup

Provide a session-backed `FlashStore` and enable validation in `forRoot`:

```ts
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import type { FlashStore, FlashErrors } from '@dudousxd/nestjs-inertia';
import type { Request } from 'express';

const sessionFlashStore: FlashStore = {
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

InertiaModule.forRoot({
  flashStore: sessionFlashStore,
  validation: {
    enabled: true,            // default false (additive / non-breaking)
    fallbackRedirect: '/',    // used when no Referer is present
    mergeMessages: 'first',   // 'first' | 'join'
  },
});
```

For lossless nested field keys (`items.0.qty`, `address.city`), plug the blessed
exception factory into your global `ValidationPipe`:

```ts
import { inertiaValidationExceptionFactory } from '@dudousxd/nestjs-inertia';
app.useGlobalPipes(new ValidationPipe({ exceptionFactory: inertiaValidationExceptionFactory }));
```

`Source: docs/forms.md, packages/core/src/index.ts`

## Core patterns

### 1. The validation redirect-back flow

With `validation.enabled`, on an Inertia non-GET request that throws
`BadRequestException`, `InertiaValidationFilter`:

1. extracts field-keyed messages → `FlashErrors`,
2. scopes them under `X-Inertia-Error-Bag` if the client set one,
3. `flashStore.write(req, errors)`,
4. emits `303 Location: <Referer | fallbackRedirect>` (same-origin only).

The redirected GET reads the flash via `render()` and shares `props.errors`
automatically — you do not pass `errors` yourself. Non-Inertia or GET requests
are rethrown as a normal JSON 400. `Source: docs/forms.md, packages/core/src/validation/inertia-validation.filter.ts`

### 2. Auto-surfaced errors and general flash

`InertiaService.render()` auto-resolves the error bag and general flash from the
store when you have not passed them explicitly:

```ts
@Post('/profile')
async update(@Req() req: Request) {
  await req.inertia.flash({ success: 'Profile updated' }); // general flash → props.flash next render
  req.inertia.location('/profile');                        // redirect back
}
```

`render()` calls `flashStore.read(req.raw)` for `props.errors` and
`flashStore.readFlash(req.raw)` for `props.flash` (consume-once), only when the
store implements them and you have not supplied the prop. `Source: packages/core/src/service.ts (render: flashStore.read / readFlash)`

### 3. Multi-form pages with error bags

Send `X-Inertia-Error-Bag: create` on the visit; the filter scopes the write so
`props.errors` becomes `{ create: { … } }` and each form reads only its own bag.
`Source: docs/forms.md (§3)`

## Common mistakes

### Mistake 1: enabling validation without a flashStore

```ts
// Wrong: boots and crashes — the filter has nowhere to write the error bag
InertiaModule.forRoot({ validation: { enabled: true } });
```

```ts
// Correct: validation.enabled requires a flashStore
InertiaModule.forRoot({ flashStore: sessionFlashStore, validation: { enabled: true } });
```

Mechanism: the APP_FILTER factory fails fast at bootstrap, throwing
`InvalidInertiaConfigException` when `validation.enabled && !flashStore`.
`Source: packages/core/src/module.ts (buildModuleProviders, APP_FILTER factory)`

### Mistake 2: passing a non-relative URL to location()

```ts
// Wrong: cross-origin absolute URL is rejected (open-redirect guard) → throws
req.inertia.location('https://evil.example.com/phish');
```

```ts
// Correct: relative path or same-origin absolute URL only
req.inertia.location('/dashboard');
```

Mechanism: `location()` runs the URL through `validateLocationUrl`, which only
accepts `/`-relative or same-origin absolute URLs. `Source: packages/core/src/service.ts (location), packages/core/src/helpers/validate-location-url.ts`

### Mistake 3: expecting flat class-validator messages to keep nested keys

```ts
// Wrong: default ValidationPipe flattens to message: string[] → nested paths lost
app.useGlobalPipes(new ValidationPipe());
```

```ts
// Correct: use the factory so items.0.qty / address.city survive into the bag
app.useGlobalPipes(new ValidationPipe({ exceptionFactory: inertiaValidationExceptionFactory }));
```

Mechanism: `extractFieldErrors` reads the factory's structured payload to build
nested keys; the default flat `message: string[]` is only mappable lossily.
`Source: docs/forms.md (§1 "Getting field-keyed errors"), packages/core/src/validation/extract-field-errors.ts`
