import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverRoutes } from '../../src/discovery/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('contract discovery', () => {
  it('attaches contract metadata to routes decorated with @ApplyContract', async () => {
    const routes = await discoverRoutes({
      moduleEntry: resolve(__dirname, '../__fixtures__/app/app.module.ts'),
    });

    const contractRoute = routes.find((r) => r.name === 'ContractUsersController.list');
    expect(contractRoute, 'ContractUsersController.list route not found').toBeDefined();

    const contract = (contractRoute as any).contract;
    expect(contract, 'contract property missing').toBeDefined();
    expect(contract.name).toBe('users.list');
    expect(contract.method).toBe('GET');
    expect(contract.path).toBe('/api/users');

    const { contractSource } = contract;
    expect(contractSource, 'contractSource missing').toBeDefined();

    // query schema contains the 'active' field
    expect(contractSource.query, 'query source should be a string').toBeTypeOf('string');
    expect(contractSource.query).toContain('active');

    // response schema contains 'id' and 'name' fields
    expect(contractSource.response, 'response source should be a string').toBeTypeOf('string');
    expect(contractSource.response).toContain('id');
    expect(contractSource.response).toContain('name');

    // body is null for a GET contract
    expect(contractSource.body).toBeNull();
  }, 20_000);

  it('leaves routes without @ApplyContract unchanged (no contract property)', async () => {
    const routes = await discoverRoutes({
      moduleEntry: resolve(__dirname, '../__fixtures__/app/app.module.ts'),
    });

    const usersListRoute = routes.find((r) => r.name === 'UsersController.list');
    expect(usersListRoute, 'UsersController.list route not found').toBeDefined();
    // Should NOT have a contract property
    expect((usersListRoute as any).contract).toBeUndefined();
  }, 20_000);
});
