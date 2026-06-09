import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';
import type { FilterFieldType } from '../../src/discovery/types.js';

const FIXTURES = join(__dirname, '..', '__fixtures__', 'app');

describe('typed filter field classification', () => {
  it('classifies entity fields by TS/decorator type', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'typed-filter.controller.ts',
    });
    const route = routes.find((r) => r.name === 'typedFilter.list');
    expect(route).toBeDefined();

    const fts = route!.contract!.contractSource.filterFieldTypes;
    expect(fts).toBeDefined();
    const byName = Object.fromEntries((fts as FilterFieldType[]).map((f) => [f.name, f]));

    expect(byName.name.kind).toBe('string');
    expect(byName.age.kind).toBe('number');
    expect(byName.createdAt.kind).toBe('date');
    expect(byName.active.kind).toBe('boolean');
    expect(byName.status.kind).toBe('string');
    expect(byName.status.enumValues).toEqual(['A', 'B']);
    expect(byName.deletedAt.nullable).toBe(true);
    expect(byName.deletedAt.kind).toBe('date');
    expect(byName['tasks.id'].kind).toBe('number');
    expect(byName['tasks.name'].kind).toBe('string');
  });

  it('keeps filterFields in sync with filterFieldTypes names (backward compat)', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'typed-filter.controller.ts',
    });
    const route = routes.find((r) => r.name === 'typedFilter.list');
    const fts = route!.contract!.contractSource.filterFieldTypes as FilterFieldType[];
    expect(route!.contract!.contractSource.filterFields).toEqual(fts.map((f) => f.name));
  });
});
