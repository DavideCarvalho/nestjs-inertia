---
"@dudousxd/nestjs-inertia-codegen": patch
---

Fix `forms.ts` generation producing invalid TypeScript when a DTO has an
unmappable class-validator decorator (`@Transform`, `@IsDateString`,
`@IsNotEmptyObject`, etc.). The "not translatable" note was emitted as a `//`
line comment inline in the single-line `z.object({ … })`, which swallowed the
closing `})` and any following fields. It is now a `/* … */` block comment.
