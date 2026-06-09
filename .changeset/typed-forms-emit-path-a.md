---
"@dudousxd/nestjs-inertia-codegen": minor
---

Emit `forms.ts` with zod schemas per validated endpoint (Path A — contract
reuse). `defineContract` bodies/queries are re-exported when bound to an
exported named const, else inlined verbatim. Adds `<Pascal>BodySchema` /
`<Pascal>QuerySchema` consts, `z.infer` type aliases, a `formSchemas` name→schema
map, collision-aliasing, and a `forms` config block (`enabled`, `watch`,
`zodImport`). Wired into `generate()`, the watcher, and the index export.
