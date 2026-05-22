# Changelog — @dudousxd/nestjs-inertia-vite

## 0.8.0-alpha.0 — 2026-05-22

### Changed
- **`nestInertia()` respects user `root`/`entry` overrides** — the Vite plugin now honours explicit `root` and `entry` options passed by the user rather than always resolving from the package default; removes a common footgun when placing `vite.config.ts` outside the project root
- Version bump to `0.8.0-alpha.0`

## 0.7.0-alpha.0 — 2026-05-22

### Changed
- Bundled with example app, CI workflows, Changesets, MIT LICENSE, and slim docs.

## [0.6.0-alpha.0] - 2026-05-22

### Changed
- Version bump to `0.6.0-alpha.0` (monorepo coordination with Plan D client release; no source changes)

## [0.5.0-alpha.0] - 2026-05-22

### Changed
- Version bump to `0.5.0-alpha.0` (monorepo coordination with codegen release; no source changes)

## [0.1.0-alpha.0] - 2026-05-22

### Added
- `setupInertiaVite(app, opts)` — main.ts helper for dev middleware and prod static serving
- `nestInertia(opts)` Vite plugin with framework flags (react / vue / svelte exactly one)
- Subpath export `@dudousxd/nestjs-inertia-vite/plugin`
