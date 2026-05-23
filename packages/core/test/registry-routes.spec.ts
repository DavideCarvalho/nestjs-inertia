import { describe, expectTypeOf, it } from 'vitest';
import type { RegistryRoutes } from '../src/index.js';

// Note: InertiaRegistry augmentation is scoped per test file.
// Without augmentation here, RegistryRoutes must resolve to the fallback.
describe('RegistryRoutes', () => {
  it('is Record<string, unknown> when InertiaRegistry has no routes key', () => {
    // Without augmentation, RegistryRoutes must be assignable from Record<string, unknown>
    expectTypeOf<RegistryRoutes>().toEqualTypeOf<Record<string, unknown>>();
  });
});

// Augment InertiaRegistry with a routes key for the second describe block.
// This uses a local declare module to simulate what the user's nestjs-inertia.d.ts does.
declare module '../src/index.js' {
  interface InertiaRegistry {
    routes: {
      'UsersController.show': { id: string };
      'UsersController.list': Record<string, never>;
    };
  }
}

describe('RegistryRoutes with augmented InertiaRegistry', () => {
  it('resolves to the augmented routes type when InertiaRegistry.routes is set', () => {
    expectTypeOf<RegistryRoutes>().toEqualTypeOf<{
      'UsersController.show': { id: string };
      'UsersController.list': Record<string, never>;
    }>();
  });
});
