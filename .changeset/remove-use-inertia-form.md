---
"@dudousxd/nestjs-inertia-client": major
---

Remove the `useInertiaForm` hook and the `./react-form` subpath export (plus the
`react-hook-form` / `@hookform/resolvers` optional peers and the `mergeServerErrors`
helper). The codegen zod-schema generation and the server-side validation filter
are unaffected. Forms should be wired with your own react-hook-form + submission
lane, using the generated zod schemas.
