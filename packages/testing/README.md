# @dudousxd/nestjs-inertia-testing

> Testing helpers for `@dudousxd/nestjs-inertia` — `expectInertia(res)` matchers, fakes, `InertiaTestingModule`.

## Install

```bash
pnpm add -D @dudousxd/nestjs-inertia-testing
```

## Fluent matcher (any test framework)

```ts
import { expectInertia } from '@dudousxd/nestjs-inertia-testing';

const res = await request(app.getHttpServer()).get('/dashboard').set('X-Inertia', 'true');
expectInertia(res)
  .toRenderComponent('Dashboard')
  .toHaveProp('user.id', 42)
  .toHavePropMatching('user.email', /@goflip\.ai$/)
  .toHaveUrl('/dashboard');
```

Full API: `toRenderComponent`, `toHaveProp`, `toHavePropMatching`, `toMissProp`, `toHaveExactProps`, `toShareProp`, `toHaveUrl`, `toHaveVersion`, `toHaveDeferredProp`, `toHaveMergeProp`, `toRedirectExternal`, `toRedirectTo`, `toHaveErrors`, `toHaveErrorBag`, `toRenderFullHtml`, `withSsrHead`, `pageObject()`, `unwrap()`.

## Jest / Vitest matchers (expect.extend)

Add to your test setup file:

```ts
// vitest.setup.ts (or jest.setup.ts)
import '@dudousxd/nestjs-inertia-testing/vitest';  // or /jest
```

Then:

```ts
expect(res).toRenderInertiaComponent('Dashboard');
expect(res).toHaveInertiaProp('user.id', 42);
```

## Controller-level tests with InertiaTestingModule

```ts
import { InertiaTestingModule } from '@dudousxd/nestjs-inertia-testing';

const moduleRef = await Test.createTestingModule({
  imports: [InertiaTestingModule.forTest({ version: 'test-v1' })],
  controllers: [DashboardController],
}).compile();
```

## Plain assert (no framework)

```ts
import { assertInertia } from '@dudousxd/nestjs-inertia-testing';
assertInertia(payload).toRenderComponent('Dashboard');
```

## License

MIT
