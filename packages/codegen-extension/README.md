# @dudousxd/nestjs-inertia-codegen-extension

> The Inertia extension for [`@dudousxd/nestjs-codegen`](https://github.com/DavideCarvalho/nestjs-codegen) — adds an Inertia `router` import and a type-safe `navigate()` helper to the generated typed client.

![npm](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-codegen-extension)

The typed client codegen lives in the standalone [`@dudousxd/nestjs-codegen`](https://github.com/DavideCarvalho/nestjs-codegen) package. This package is **just the Inertia extension** for it: register `nestjsInertiaCodegen()` and the generated `api.ts` gains a `navigate()` helper backed by Inertia's `router`, so your mutations and links can drive Inertia visits with full route-name and params autocomplete.

## Install

```bash
pnpm add -D @dudousxd/nestjs-inertia-codegen-extension
```

It is an extension for the core codegen, so install that alongside it (the Inertia adapter for React provides `router`):

```bash
pnpm add -D @dudousxd/nestjs-codegen
pnpm add @inertiajs/react
```

| Peer dependency | Range |
|---|---|
| `@dudousxd/nestjs-codegen` | `>=0.1.0` |
| `@inertiajs/react` | `>=1.0.0` |

## Setup

Register the extension in the codegen's `extensions: [...]` array — either via the Nest module or in `defineConfig` for CLI/CI runs.

```ts title="src/app.module.ts"
import { NestjsCodegenModule } from '@dudousxd/nestjs-codegen/nest';
import { nestjsInertiaCodegen } from '@dudousxd/nestjs-inertia-codegen-extension';

NestjsCodegenModule.forRoot({
  contracts: { glob: 'src/**/*.controller.ts' },
  pages: { glob: 'inertia/pages/**/*.tsx' },
  app: { moduleEntry: 'src/app.module.ts' },
  codegen: { outDir: '.nestjs-inertia' },
  extensions: [nestjsInertiaCodegen()],
});
```

The same array works in `nestjs-codegen.config.ts` (`defineConfig`) — keep one source of truth and import it into both.

## What it adds

`nestjsInertiaCodegen()` is a `CodegenExtension` whose `apiHeader` hook contributes to the generated `api.ts`:

- an import of Inertia's `router` — `import { router } from '@inertiajs/react';`
- a `NavigateOptions` type (`method`, `data`, `preserveState`, `preserveScroll`, `replace`)
- a type-safe **`navigate()`** helper that resolves a named route to its URL and calls `router.visit()`

```tsx
import { navigate } from '~codegen/api';

// Route name autocompleted; params required when the route has :id
navigate('users.show', { params: { id: '42' } });
navigate('showDashboard.show');

// With Inertia visit options
navigate('users.list', { preserveState: true, replace: true });
```

Without the extension, `api.ts` is a plain typed-fetch client and `@inertiajs/react`'s `router` is never imported. The extension owns only the Inertia surface of `api.ts` — Inertia page discovery (`pages.d.ts` / `components.json`) and shared props are still handled by the core `pages` / `app` config.

## How it fits

`@dudousxd/nestjs-codegen` runs a discovery → IR → emit pipeline and exposes an extension contract at `@dudousxd/nestjs-codegen/extension`. Integrations aren't config flags — they're extensions you register in `extensions: [...]`, and each one shapes routes, emits extra files, or augments `api.ts`. This package implements that contract with a single `apiHeader` hook:

```ts
import type { CodegenExtension } from '@dudousxd/nestjs-codegen/extension';

export function nestjsInertiaCodegen(): CodegenExtension {
  return {
    name: 'nestjs-inertia',
    apiHeader() {
      return {
        imports: ["import { router } from '@inertiajs/react';"],
        statements: [/* NavigateOptions + navigate() */],
      };
    },
  };
}
```

It composes with the other companion extensions — e.g. `tanstackQuery()` (`@dudousxd/nestjs-codegen-tanstack`) for `queryOptions`/`mutationOptions` and `nestjsFilterCodegen()` (`@dudousxd/nestjs-filter-codegen`) for typed filters.

## Links

- Codegen core: [`@dudousxd/nestjs-codegen`](https://github.com/DavideCarvalho/nestjs-codegen)
- Inertia adapter for NestJS: [`@dudousxd/nestjs-inertia`](https://github.com/DavideCarvalho/nestjs-inertia)

## License

MIT
