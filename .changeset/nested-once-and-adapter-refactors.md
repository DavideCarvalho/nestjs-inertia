---
"@dudousxd/nestjs-inertia": patch
"@dudousxd/nestjs-inertia-codegen": patch
---

Fix: nested `once()` markers now mirror top-level `once()` semantics — they re-resolve only on a full reload or when their key is explicitly reset (was incorrectly gated on `subKeep === null`).

Internal refactors (behavior-preserving): share the method-spoof rule across Express and Fastify, collapse the handlebars/ejs/pug/liquid template-engine adapters into one `createTemplateEngineAdapter` factory, route the validation filter through the request adapter (inject `HttpAdapterHost`, drop the bespoke `sendRedirect`), and extract `zodAstToTs` + route-name helpers out of `contracts-fast`.
