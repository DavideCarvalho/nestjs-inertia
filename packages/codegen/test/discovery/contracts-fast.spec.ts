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

    // Should find at least the ListUsers contract
    const route = routes.find((r) => r.name === 'ListUsers');
    expect(route, 'ListUsers route not found').toBeDefined();
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
