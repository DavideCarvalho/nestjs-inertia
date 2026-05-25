import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';

const FIXTURES = join(__dirname, '..', '__fixtures__', 'app');

describe('@ApplyFilter query type extraction', () => {
  it('extracts filter class properties as query type', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter.controller.ts',
    });
    const filterRoute = routes.find((r) => r.name === 'filter.list');
    expect(filterRoute).toBeDefined();
    expect(filterRoute!.contract).toBeDefined();
    const query = filterRoute!.contract!.contractSource.query;
    expect(query).toContain('name?: string');
    expect(query).toContain('minAge?: number');
    expect(query).toContain('status?: string');
  });

  it('does not affect routes without @ApplyFilter', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'dto-controller.controller.ts',
    });
    for (const route of routes) {
      if (route.contract?.contractSource.query) {
        expect(route.contract.contractSource.query).not.toContain('ApplyFilter');
      }
    }
  });
});
