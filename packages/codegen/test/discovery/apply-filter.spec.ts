import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';
import type { FilterFieldType } from '../../src/discovery/types.js';
import { emitApi } from '../../src/emit/emit-api.js';

const FIXTURES = join(__dirname, '..', '__fixtures__', 'app');

describe('@ApplyFilter query type extraction', () => {
  it('carries the filter field data + marks the route as a query-source filter', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter.controller.ts',
    });
    const filterRoute = routes.find((r) => r.name === 'filter.list');
    expect(filterRoute).toBeDefined();
    expect(filterRoute!.contract).toBeDefined();
    const cs = filterRoute!.contract!.contractSource;
    // The TypedFilterQuery TYPE is rendered in emit-api (the single renderer);
    // discovery only carries the DATA + the source marker.
    expect(cs.query).toBeNull();
    expect(cs.filterSource).toBe('query');
    expect(cs.filterFields).toEqual(['name', 'minAge', 'status']);
    const byName = Object.fromEntries(
      (cs.filterFieldTypes as FilterFieldType[]).map((f) => [f.name, f]),
    );
    // Optional (?) properties are nullable → `| null` when rendered.
    expect(byName.name.nullable).toBe(true);
    expect(byName.minAge.kind).toBe('number');
    expect(byName.minAge.nullable).toBe(true);
    expect(byName.status.nullable).toBe(true);
  });

  it('emit-api renders the query position as TypedFilterQuery from that data', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter.controller.ts',
    });
    const outDir = await mkdtemp(join(tmpdir(), 'apply-filter-emit-'));
    try {
      await emitApi(routes, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // The query TYPE position (in ApiRouter) is byte-identical to the args
      // used by the `_filterQueryTyped<...>` factory.
      expect(content).toContain(
        `query: import('@dudousxd/nestjs-filter-client').TypedFilterQuery<"name" | "minAge" | "status", { "name": string | null; "minAge": number | null; "status": string | null }>;`,
      );
      expect(content).toContain(
        'filterQuery: () => _filterQueryTyped<"name" | "minAge" | "status", ' +
          '{ "name": string | null; "minAge": number | null; "status": string | null }>(),',
      );
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
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

describe('@ApplyFilter query-type vs factory-type consistency', () => {
  afterEach(() => {});

  it('an enum @FilterFor field references the named import in BOTH positions', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter-for-param.controller.ts',
    });
    const outDir = await mkdtemp(join(tmpdir(), 'apply-filter-enum-emit-'));
    try {
      await emitApi(routes, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      const map =
        '{ "minAge": number; "state": Status; "mode": "draft" | "published"; "score": number }';
      const union = '"minAge" | "state" | "mode" | "score"';
      // query TYPE position references the named enum `Status` (not the inlined
      // "active" | "archived" literal) — matching the factory exactly.
      expect(content).toContain(
        `query: import('@dudousxd/nestjs-filter-client').TypedFilterQuery<${union}, ${map}>;`,
      );
      expect(content).toContain(`filterQuery: () => _filterQueryTyped<${union}, ${map}>(),`);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
