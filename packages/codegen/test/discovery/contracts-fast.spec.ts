/**
 * Integration tests for discoverContractsFast.
 * Uses the existing fixture controller (contract-users.controller.ts) and
 * asserts that the returned RouteDescriptor matches what the heavy probe
 * would produce.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../__fixtures__/app');

describe('discoverContractsFast', () => {
  it('discovers routes from the contract-users fixture controller', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: '*.controller.ts',
    });

    // Should find at least the ListUsers contract (name comes from defineContract's name field)
    const route = routes.find((r) => r.name === 'users.list');
    expect(route, 'users.list route not found').toBeDefined();
  });

  it('returns GET method and /api/users path', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/api/users');
  });

  it('includes contract with users.list name', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    const route = routes[0];
    expect(route.contract).toBeDefined();
    expect(route.contract?.name).toBe('users.list');
  });

  it('includes contractSource with active in query and id/name in response', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    const route = routes[0];
    const cs = route.contract?.contractSource;
    expect(cs).toBeDefined();

    // query schema should contain 'active' and 'boolean'
    expect(cs?.query).toContain('active');
    expect(cs?.query).toContain('boolean');

    // response schema should contain 'id' and 'name'
    expect(cs?.response).toContain('id');
    expect(cs?.response).toContain('name');

    // body is null for a GET contract
    expect(cs?.body).toBeNull();
  });

  it('has no params for /api/users (no path params)', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    expect(routes[0].params).toEqual([]);
  });

  it('handles empty controller prefix by not duplicating slash', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    expect(routes[0].path).toBe('/api/users');
  });
});

describe('discoverContractsFast — @Inertia/@Get controllers (B-2 parity)', () => {
  it('enumerates a plain @Get @Inertia controller with no @ApplyContract', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inertia-dashboard.controller.ts',
    });

    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route.name).toBe('DashboardController.index');
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/dashboard');
    expect(route.contract).toBeUndefined();
  });

  it('discovers a route-only controller with an empty prefix path', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inertia-dashboard.controller.ts',
    });

    expect(routes[0].params).toEqual([]);
  });

  it('enumerates both @ApplyContract and plain @Get methods in a mixed controller', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'mixed.controller.ts',
    });

    expect(routes).toHaveLength(2);
    const contract = routes.find((r) => r.name === 'posts.list' || r.contract !== undefined);
    const plain = routes.find((r) => r.name === 'MixedController.index');

    expect(contract).toBeDefined();
    expect(contract?.contract).toBeDefined();

    expect(plain).toBeDefined();
    expect(plain?.method).toBe('GET');
    expect(plain?.path).toBe('/dashboard');
    expect(plain?.contract).toBeUndefined();
  });
});

describe('discoverContractsFast — all 5 HTTP verbs from NestJS decorators', () => {
  it('discovers all 5 routes from the all-verbs fixture', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });

    expect(routes).toHaveLength(5);
  });

  it('extracts GET method from @Get()', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    const r = routes.find((x) => x.name === 'items.list');
    expect(r?.method).toBe('GET');
    expect(r?.path).toBe('/api/items');
  });

  it('extracts POST method from @Post()', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    const r = routes.find((x) => x.name === 'items.create');
    expect(r?.method).toBe('POST');
    expect(r?.path).toBe('/api/items');
  });

  it('extracts PUT method from @Put() with path param', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    const r = routes.find((x) => x.name === 'items.replace');
    expect(r?.method).toBe('PUT');
    expect(r?.path).toBe('/api/items/:id');
    expect(r?.params).toEqual([{ name: 'id', source: 'path' }]);
  });

  it('extracts PATCH method from @Patch()', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    const r = routes.find((x) => x.name === 'items.update');
    expect(r?.method).toBe('PATCH');
    expect(r?.path).toBe('/api/items/:id');
  });

  it('extracts DELETE method from @Delete()', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    const r = routes.find((x) => x.name === 'items.delete');
    expect(r?.method).toBe('DELETE');
    expect(r?.path).toBe('/api/items/:id');
  });

  it('all routes have contracts', async () => {
    const routes = await discoverContractsFast({ cwd: fixturesDir, glob: 'all-verbs.controller.ts' });
    for (const r of routes) {
      expect(r.contract, `${r.name} should have a contract`).toBeDefined();
    }
  });
});

describe('discoverContractsFast — inline defineContract call inside @ApplyContract', () => {
  it('discovers a route with inline @ApplyContract(defineContract(...))', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inline-contract.controller.ts',
    });

    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/api/foo');
    expect(route.contract).toBeDefined();
  });

  it('inline defineContract has the correct name from the options object', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inline-contract.controller.ts',
    });

    const route = routes[0];
    expect(route.contract?.name).toBe('foo.list');
  });

  it('inline defineContract has response type extracted from Zod schema', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inline-contract.controller.ts',
    });

    const cs = routes[0].contract?.contractSource;
    expect(cs?.response).toContain('id');
    expect(cs?.body).toBeNull();
  });
});
