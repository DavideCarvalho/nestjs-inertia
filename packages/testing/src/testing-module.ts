import { InertiaModule } from '@dudousxd/nestjs-inertia';
import type { InertiaModuleOptions } from '@dudousxd/nestjs-inertia';
import type { DynamicModule } from '@nestjs/common';

export class InertiaTestingModule {
  static forTest(options: InertiaModuleOptions = {}): DynamicModule {
    return InertiaModule.forRoot({
      version: 'test-v1',
      ...options,
    });
  }
}
