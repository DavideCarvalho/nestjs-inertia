import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { InertiaModule } from '../src/index.js';
import { featureToken } from '../src/tokens.js';
import type { InertiaModuleOptions, InertiaOptionsFactory } from '../src/index.js';

describe('InertiaModule.forFeature — shell renderer', () => {
  it('forFeature accepts template engine rootView (e.g. .hbs)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-feature-engine-'));
    const sub = join(dir, 'inertia');
    mkdirSync(sub);
    writeFileSync(join(sub, 'admin-root.hbs'), '<!doctype html><body>{{{inertia}}}</body>');

    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({}),
        InertiaModule.forFeature({
          scope: 'admin',
          rootView: join(sub, 'admin-root.hbs'),
        }),
      ],
    }).compile();

    const shellRenderer = moduleRef.get(featureToken('SHELL_RENDERER', 'admin'));
    expect(shellRenderer).toBeDefined();
  });
});

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

  it('throws when no strategy is provided', () => {
    expect(() => InertiaModule.forFeatureAsync({ scope: 'admin' })).toThrow(/requires one of/i);
  });

  it('throws when multiple strategies are provided', () => {
    @Injectable() class C implements InertiaOptionsFactory { createInertiaOptions() { return {}; } }
    expect(() => InertiaModule.forFeatureAsync({
      scope: 'admin',
      useFactory: () => ({}),
      useClass: C,
    })).toThrow(/exactly one of/i);
  });
});
