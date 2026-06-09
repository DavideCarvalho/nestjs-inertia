---
"@dudousxd/nestjs-inertia-codegen": minor
---

Watch DTO globs (`forms.watch`, default `src/**/*.dto.ts`) so `*.dto.ts` changes
re-emit `forms.ts`. Forms emit now inlines contract zod text by default (instead
of re-exporting from the controller) so server-only deps never leak into the
client bundle. Also resolves relative `./x.dto.js` imports to `x.dto.ts`
(NodeNext style) when following DTO references across files.
