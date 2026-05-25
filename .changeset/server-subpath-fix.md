---
"@dudousxd/nestjs-inertia-client": patch
"@dudousxd/nestjs-inertia-codegen": patch
---

Fix "process is not defined" in browser by moving server-only exports (ApplyContract, As, ContractValidationPipe) to @dudousxd/nestjs-inertia-client/server subpath. Add useTypedReload for typed partial reloads.
