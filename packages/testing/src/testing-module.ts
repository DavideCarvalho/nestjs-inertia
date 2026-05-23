import { InertiaModule } from '@dudousxd/nestjs-inertia';
import type { InertiaModuleOptions } from '@dudousxd/nestjs-inertia';
import type { DynamicModule } from '@nestjs/common';

// biome-ignore lint/complexity/noStaticOnlyClass: factory pattern; static-only class is intentional for API consistency
export class InertiaTestingModule {
  static forTest(options: InertiaModuleOptions = {}): DynamicModule {
    return InertiaModule.forRoot({
      version: 'test-v1',
      ...options,
    });
  }
}
