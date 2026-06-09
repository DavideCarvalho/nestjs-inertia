---
"@dudousxd/nestjs-inertia": minor
---

Add `InertiaValidationFilter`: opt-in (`validation: { enabled: true }`) automatic
validation-error handling that flashes a field-keyed error bag and 303-redirects
back on Inertia non-GET requests. Ships `inertiaValidationExceptionFactory`
(blessed `ValidationPipe` factory), `flattenValidationErrors`, and
`extractFieldErrors` (recognizes the factory payload, `ContractValidationPipe`
issues, raw `ZodError`, and flat class-validator `message: string[]`). Cross-runtime
(Express + Fastify) via shared `getHeader`. Also fixes `ErrorBagInterceptor` to use
the cross-runtime header read so Fastify error-bag scoping works.
