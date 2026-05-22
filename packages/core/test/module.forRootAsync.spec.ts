import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { InertiaModule, INERTIA_MODULE_OPTIONS, InvalidInertiaConfigException } from '../src/index.js';
import type { InertiaModuleOptions, InertiaOptionsFactory } from '../src/index.js';

describe('InertiaModule.forRootAsync — useFactory', () => {
  it('resolves options via factory function', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRootAsync({
          useFactory: (): InertiaModuleOptions => ({ version: 'from-factory' }),
        }),
      ],
    }).compile();
    const opts = moduleRef.get<InertiaModuleOptions>(INERTIA_MODULE_OPTIONS);
    expect(opts.version).toBe('from-factory');
  });

  it('factory can be async', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRootAsync({
          useFactory: async (): Promise<InertiaModuleOptions> => {
            await new Promise(r => setTimeout(r, 1));
            return { version: 'async-factory' };
          },
        }),
      ],
    }).compile();
    const opts = moduleRef.get<InertiaModuleOptions>(INERTIA_MODULE_OPTIONS);
    expect(opts.version).toBe('async-factory');
  });

  it('factory receives injected providers', async () => {
    @Injectable()
    class FakeConfig {
      readonly version = 'from-fake-config';
    }

    const moduleRef = await Test.createTestingModule({
      providers: [FakeConfig],
      imports: [
        InertiaModule.forRootAsync({
          inject: [FakeConfig],
          useFactory: (cfg: FakeConfig): InertiaModuleOptions => ({ version: cfg.version }),
        }),
      ],
    }).compile();
    const opts = moduleRef.get<InertiaModuleOptions>(INERTIA_MODULE_OPTIONS);
    expect(opts.version).toBe('from-fake-config');
  });
});

describe('InertiaModule.forRootAsync — useClass', () => {
  it('resolves options via class factory', async () => {
    @Injectable()
    class MyInertiaConfig implements InertiaOptionsFactory {
      createInertiaOptions(): InertiaModuleOptions {
        return { version: 'from-useclass' };
      }
    }
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRootAsync({ useClass: MyInertiaConfig })],
    }).compile();
    const opts = moduleRef.get<InertiaModuleOptions>(INERTIA_MODULE_OPTIONS);
    expect(opts.version).toBe('from-useclass');
  });
});

describe('InertiaModule.forRootAsync — useExisting', () => {
  it('resolves options via existing provider', async () => {
    @Injectable()
    class SharedInertiaConfig implements InertiaOptionsFactory {
      createInertiaOptions(): InertiaModuleOptions {
        return { version: 'from-existing' };
      }
    }
    const moduleRef = await Test.createTestingModule({
      providers: [SharedInertiaConfig],
      imports: [InertiaModule.forRootAsync({ useExisting: SharedInertiaConfig })],
    }).compile();
    const opts = moduleRef.get<InertiaModuleOptions>(INERTIA_MODULE_OPTIONS);
    expect(opts.version).toBe('from-existing');
  });
});

describe('InertiaModule.forRootAsync — validation', () => {
  it('throws when no path is given', () => {
    expect(() => InertiaModule.forRootAsync({})).toThrow(InvalidInertiaConfigException);
  });

  it('throws when both useFactory and useClass are given', () => {
    @Injectable() class C implements InertiaOptionsFactory { createInertiaOptions() { return {}; } }
    expect(() =>
      InertiaModule.forRootAsync({ useFactory: () => ({}), useClass: C }),
    ).toThrow(InvalidInertiaConfigException);
  });
});
