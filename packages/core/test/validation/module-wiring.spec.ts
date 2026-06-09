import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { FlashStore } from '../../src/flash/flash-store.js';
import { InertiaModule } from '../../src/index.js';

const flashStore: FlashStore = { read: () => ({}), write: () => {} };

describe('InertiaValidationFilter module wiring', () => {
  it('throws at compile time when validation.enabled without a flashStore', async () => {
    await expect(
      Test.createTestingModule({
        imports: [InertiaModule.forRoot({ validation: { enabled: true } })],
      }).compile(),
    ).rejects.toThrow(/validation\.enabled requires a flashStore/);
  });

  it('compiles when enabled with a flashStore', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ flashStore, validation: { enabled: true } })],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('compiles when validation is disabled (default, inert filter)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ flashStore })],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
