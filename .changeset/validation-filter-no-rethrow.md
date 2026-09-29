---
"@dudousxd/nestjs-inertia": patch
---

fix(validation): `InertiaValidationFilter` no longer rethrows from an async `catch()`. Nest does not await exception filters, so every `BadRequestException` the filter did not handle (non-Inertia/API requests, GET requests, non-validation 400s — and _all_ 400s when `validation.enabled` is off, since the filter is always registered) became an unhandled rejection that crashed the process and left the request hanging. Those cases now get Nest's default JSON 400 via `BaseExceptionFilter`, the Inertia redirect-back path is unchanged, and a failing `flashStore.write` is answered with Nest's default 500 instead of rejecting.
