# Contributing to nestjs-inertia

Thank you for taking the time to contribute! This document covers everything you need to get started.

## Prerequisites

- **Node.js** 20 or 22 (LTS recommended)
- **pnpm** 9 (`npm install -g pnpm@9`)
- **Git**

## Setup

```bash
git clone https://github.com/dudousxd/nestjs-inertia.git
cd nestjs-inertia
pnpm install
```

Build all packages:

```bash
pnpm -r --filter "./packages/*" build
```

Run the full test suite:

```bash
pnpm -r --filter "./packages/*" test
```

## Monorepo layout

```
nestjs-inertia/
  packages/
    core/       — @dudousxd/nestjs-inertia       (NestJS module + @Inertia decorator)
    vite/       — @dudousxd/nestjs-inertia-vite   (Vite plugin + dev-server middleware)
    testing/    — @dudousxd/nestjs-inertia-testing (test helpers + expectInertia matchers)
    codegen/    — @dudousxd/nestjs-inertia-codegen (CLI: typed pages, routes, api.ts)
    client/     — @dudousxd/nestjs-inertia-client  (Contract, createFetcher, SSR hydration)
  examples/
    express-react/  — end-to-end demo app
  docs/             — architecture, quickstart, codegen reference
```

Each package under `packages/` has its own `tsconfig.json`, `vitest.config.ts`, and `build` script.

## TDD discipline

We follow a strict test-first workflow:

1. Write a failing test that covers the desired behavior.
2. Write the minimal implementation to make it pass.
3. Refactor with the tests green.

Run a single package's tests in watch mode:

```bash
pnpm --filter @dudousxd/nestjs-inertia test --watch
```

## Conventional Commits

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary>
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `build`.

Examples:

```
feat(core): add @InertiaPartial decorator for partial reloads
fix(vite): resolve manifest path on Windows
test(testing): cover expectInertia.toHaveProps with nested props
chore: bump pnpm to 9.1
```

**Breaking changes** must include `BREAKING CHANGE:` in the commit footer:

```
feat(client)!: rename createFetcher to createClient

BREAKING CHANGE: createFetcher has been renamed to createClient.
```

## Changesets release flow

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning.

1. Make your changes and write tests.
2. Run `pnpm changeset` and follow the prompts to describe what changed and which packages are affected.
3. Commit the generated `.changeset/*.md` file alongside your code changes.

When a PR carrying a changeset is merged, the release workflow versions it in place (a `chore: version packages` commit pushed to `main`) and publishes to npm in the same run. There is no release PR to merge; a manual run of the workflow publishes a throwaway beta snapshot under the `beta` dist-tag.

Do **not** manually edit `CHANGELOG.md` or bump versions in `package.json` files — Changesets handles this.

## Build output check

Packages that build ESM and CJS in two tsup passes clean `dist/` **once**, with an `rmSync` at the top of
`tsup.config.ts`; no pass sets `clean: true`. tsup runs the passes of a config array at the same time,
so a pass that cleans can delete files another pass already wrote (seen as a missing `dist/index.d.cts`
under a loaded `turbo run build`).

`tsc` builds run with `--incremental false`. The `.tsbuildinfo` file sits outside `dist/` (and outside
turbo's cached `outputs`), so after `dist/` is removed or restored an incremental build can decide the
outputs are current and emit only some files (seen as a missing `dist/index.js`).

`pnpm check:exports` (also each package's `prepack`, and a CI step after the build) fails if a path in a
package's `exports`, `main`, `module`, `types` or `bin` does not exist. `release` runs it before
`changeset publish`. Run it after any build you are about to pack.

## Linting and formatting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
pnpm exec biome check .          # report issues
pnpm exec biome check --write .  # auto-fix safe issues
```

CI runs `biome ci .` — your PR will fail if Biome reports errors.

## Pull request process

1. Fork the repo and create a branch from `main` with a descriptive name (`feat/partial-reloads`, `fix/vite-manifest-path`).
2. Ensure all tests pass: `pnpm -r --filter "./packages/*" test`.
3. Ensure Biome is clean: `pnpm exec biome ci .`.
4. Add a changeset if your change affects a public package: `pnpm changeset`.
5. Open a PR against `main`. Fill in the PR template.
6. At least one maintainer review is required before merging.
7. Squash-merge is preferred.

## Reporting bugs

Open a GitHub Issue with:

- A clear title and description of the bug.
- Steps to reproduce (minimal reproduction preferred).
- Expected vs. actual behavior.
- Node.js and pnpm versions.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.
