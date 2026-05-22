import { DynamicModule } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import type { InertiaModuleOptions } from '@dudousxd/nestjs-inertia';

export class InertiaTestingModule {
  static forTest(options: InertiaModuleOptions = {}): DynamicModule {
    return InertiaModule.forRoot({
      version: 'test-v1',
      ...options,
    });
  }
}
