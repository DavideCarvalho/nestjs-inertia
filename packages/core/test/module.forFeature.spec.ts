import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { InertiaModule } from '../src/index.js';
import { featureToken } from '../src/tokens.js';
import type { InertiaModuleOptions, InertiaOptionsFactory } from '../src/index.js';

describe('InertiaModule.forFeature', () => {
  it('registers scoped options under Symbol.for(prefix:scope)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({ version: 'v1' }),
        InertiaModule.forFeature({ scope: 'admin', version: 'admin-v1' }),
      ],
    }).compile();
    const opts = moduleRef.get(featureToken('OPTIONS', 'admin'));
    expect(opts).toMatchObject({ scope: 'admin', version: 'admin-v1' });
  });

  it('throws when scope is reserved name "default"', () => {
    expect(() => InertiaModule.forFeature({ scope: 'default', version: 'v' }))
      .toThrow(/reserved/i);
  });

  it('multiple scopes coexist with independent options', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({ version: 'main' }),
        InertiaModule.forFeature({ scope: 'admin', version: 'admin' }),
        InertiaModule.forFeature({ scope: 'portal', version: 'portal' }),
      ],
    }).compile();
    expect(moduleRef.get(featureToken('OPTIONS', 'admin'))).toMatchObject({ version: 'admin' });
    expect(moduleRef.get(featureToken('OPTIONS', 'portal'))).toMatchObject({ version: 'portal' });
  });
});

describe('InertiaModule.forFeatureAsync', () => {
  it('useFactory + inject', async () => {
    @Injectable()
    class AdminCfg { readonly v = 'async-admin'; }
    const moduleRef = await Test.createTestingModule({
      providers: [AdminCfg],
      imports: [
        InertiaModule.forRoot({}),
        InertiaModule.forFeatureAsync({
          scope: 'admin',
          inject: [AdminCfg],
          useFactory: (cfg: AdminCfg) => ({ version: cfg.v }),
        }),
      ],
    }).compile();
    const opts = moduleRef.get(featureToken('OPTIONS', 'admin'));
    expect((opts as { version: string }).version).toBe('async-admin');
  });

  it('rejects "default" as scope', () => {
    expect(() => InertiaModule.forFeatureAsync({
      scope: 'default',
      useFactory: () => ({}),
    })).toThrow(/reserved/i);
  });
});
