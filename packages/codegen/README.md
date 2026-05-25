# @dudousxd/nestjs-inertia-codegen

> CLI that reads your NestJS controllers and emits typed pages, routes, and a full API client.

[![npm version](https://img.shields.io/npm/v/@dudousxd/nestjs-inertia-codegen)](https://www.npmjs.com/package/@dudousxd/nestjs-inertia-codegen)

## Install

```bash
pnpm add -D @dudousxd/nestjs-inertia-codegen
```

## Quick start

```bash
nestjs-inertia init          # scaffold config + patch .gitignore
nestjs-inertia codegen       # one-shot generation
nestjs-inertia codegen --watch  # watch mode
nestjs-inertia doctor        # diagnose setup
nestjs-inertia doctor --fix  # auto-fix issues
```

## Output

```
.nestjs-inertia/
  pages.d.ts   — module augmentation for typed @Inertia() and page props
  routes.ts    — route map + route() helper
  api.ts       — queryOptions(), mutationOptions(), queryKey(), infiniteQueryOptions()
```

Response types use `ReturnType<import(...)>`. Page props use `Parameters<typeof import(...).default>[0]` (inferred from the default export, no `ComponentProps` needed).

## How it works

The codegen reads `@Controller`, `@Get`, `@Post`, `@Body`, `@Query`, `@Param`, and `@ApiResponse` decorators from your controllers. No contracts, no Zod schemas. Your existing DTOs are the source of truth.

DTOs are resolved across files (follows imports, reads tsconfig path aliases). Interfaces, type aliases, and enums all work.

## Docs

Full documentation: **https://davidecarvalho.github.io/nestjs-inertia/guides/codegen/**

## License

MIT
