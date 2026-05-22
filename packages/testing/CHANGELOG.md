# Changelog — @dudousxd/nestjs-inertia-testing

## [0.6.0-alpha.0] - 2026-05-22

### Changed
- Version bump to `0.6.0-alpha.0` (monorepo coordination with Plan D client release; no source changes)

## [0.5.0-alpha.0] - 2026-05-22

### Changed
- Version bump to `0.5.0-alpha.0` (monorepo coordination with codegen release; no source changes)

## [0.1.0-alpha.0] - 2026-05-22

### Added
- `expectInertia(res)` fluent matcher API
- `assertInertia(payload)` for plain Node assert / ava / Node test runner
- `createFakeInertiaRequest` + `createFakeInertiaResponse` fakes
- `InertiaTestingModule.forTest()` wrapper over `InertiaModule.forRoot`
- Jest matcher integration via `@dudousxd/nestjs-inertia-testing/jest`
- Vitest matcher integration via `@dudousxd/nestjs-inertia-testing/vitest`
