---
"@dudousxd/nestjs-inertia-codegen": minor
---

Translate class-validator-decorated DTO classes into zod schemas via pure AST
reading (Path B). Implements the full decorator→zod mapping table
(`@IsEmail`→`.email()`, `@MinLength`→`.min()`, `@IsEnum`→`z.enum`/`z.nativeEnum`,
`@ValidateNested`+`@Type`→hoisted nested schemas, arrays, custom `{ message }`,
etc.), with `z.lazy()` recursion guards and skip-+-warn for unmappable decorators
(`@IsStrongPassword`, custom validators). A `defineContract` schema always takes
precedence; synthesis only runs on the plain-verb path. No class-validator
runtime dependency.
