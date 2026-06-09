import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';

const FIXTURES = join(__dirname, '..', '__fixtures__', 'app');

describe('@ApplyFilter query type extraction', () => {
  it('generates TypedFilterQuery with field names from filter class', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter.controller.ts',
    });
    const filterRoute = routes.find((r) => r.name === 'filter.list');
    expect(filterRoute).toBeDefined();
    expect(filterRoute!.contract).toBeDefined();
    const query = filterRoute!.contract!.contractSource.query;
    expect(query).toContain('TypedFilterQuery');
    expect(query).toContain('"name"');
    expect(query).toContain('"minAge"');
    expect(query).toContain('"status"');
    // Phase 5: the field-type map is emitted as a second type arg.
    // Optional (?) properties are nullable → `| null`.
    expect(query).toBe(
      `import('@dudousxd/nestjs-filter-client').TypedFilterQuery<"name" | "minAge" | "status", { "name": string | null; "minAge": number | null; "status": string | null }>`,
    );
  });

  it('does not affect routes without @ApplyFilter', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'dto-controller.controller.ts',
    });
    for (const route of routes) {
      if (route.contract?.contractSource.query) {
        expect(route.contract.contractSource.query).not.toContain('TypedFilterQuery');
      }
    }
  });
});
