/**
 * Integration tests for discoverContractsFast.
 * Uses the existing fixture controller (contract-users.controller.ts) and
 * asserts that the returned RouteDescriptor matches what the heavy probe
 * would produce.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deriveClassSegment,
  deriveRouteName,
  discoverContractsFast,
  resolveRouteName,
} from '../../src/discovery/contracts-fast.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../__fixtures__/app');

describe('discoverContractsFast', () => {
  it('discovers routes from the contract-users fixture controller', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    // Name is now derived from ContractUsersController.list → contractUsers.list
    const route = routes.find((r) => r.name === 'contractUsers.list');
    expect(route, 'contractUsers.list route not found').toBeDefined();
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

  it('derives route name contractUsers.list from ContractUsersController.list', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'contract-users.controller.ts',
    });

    const route = routes[0];
    expect(route.contract).toBeDefined();
    // name is on RouteDescriptor, not ContractDescriptor
    expect(route.name).toBe('contractUsers.list');
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
    // MixedController.list → mixed.list (auto-derived)
    const contract = routes.find((r) => r.name === 'mixed.list' || r.contract !== undefined);
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
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
    // AllVerbsController.list → allVerbs.list
    const r = routes.find((x) => x.name === 'allVerbs.list');
    expect(r?.method).toBe('GET');
    expect(r?.path).toBe('/api/items');
  });

  it('extracts POST method from @Post()', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
    // AllVerbsController.create → allVerbs.create
    const r = routes.find((x) => x.name === 'allVerbs.create');
    expect(r?.method).toBe('POST');
    expect(r?.path).toBe('/api/items');
  });

  it('extracts PUT method from @Put() with path param', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
    // AllVerbsController.replace → allVerbs.replace
    const r = routes.find((x) => x.name === 'allVerbs.replace');
    expect(r?.method).toBe('PUT');
    expect(r?.path).toBe('/api/items/:id');
    expect(r?.params).toEqual([{ name: 'id', source: 'path' }]);
  });

  it('extracts PATCH method from @Patch()', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
    // AllVerbsController.update → allVerbs.update
    const r = routes.find((x) => x.name === 'allVerbs.update');
    expect(r?.method).toBe('PATCH');
    expect(r?.path).toBe('/api/items/:id');
  });

  it('extracts DELETE method from @Delete()', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
    // AllVerbsController.remove → allVerbs.remove (method is named 'remove')
    const r = routes.find((x) => x.name === 'allVerbs.remove');
    expect(r?.method).toBe('DELETE');
    expect(r?.path).toBe('/api/items/:id');
  });

  it('all routes have contracts', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'all-verbs.controller.ts',
    });
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

  it('derives name inlineContract.list from InlineContractController.list', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inline-contract.controller.ts',
    });

    const route = routes[0];
    // Name is now on RouteDescriptor, not ContractDescriptor
    expect(route.name).toBe('inlineContract.list');
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

// ---------------------------------------------------------------------------
// Unit tests for deriveRouteName helper
// ---------------------------------------------------------------------------

describe('deriveRouteName', () => {
  it('UsersController.list → users.list', () => {
    expect(deriveRouteName('UsersController', 'list')).toBe('users.list');
  });

  it('AdminUsersController.create → adminUsers.create', () => {
    expect(deriveRouteName('AdminUsersController', 'create')).toBe('adminUsers.create');
  });

  it('PostsController.show → posts.show', () => {
    expect(deriveRouteName('PostsController', 'show')).toBe('posts.show');
  });

  it('throws for a class named exactly Controller (empty segment after strip)', () => {
    expect(() => deriveRouteName('Controller', 'list')).toThrow(/derives empty route segment/);
  });

  it('class name with no Controller suffix is used as-is (first letter lowercased)', () => {
    // If someone names a class Widgets (no Controller suffix), use it as-is
    expect(deriveRouteName('Widgets', 'list')).toBe('widgets.list');
  });
});

// ---------------------------------------------------------------------------
// @As decorator override
// ---------------------------------------------------------------------------

describe('discoverContractsFast — @As decorator override', () => {
  it('@As overrides auto-derived name', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'as-override.controller.ts',
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('crew.directory.fetch');
  });

  it('@As override preserves method and path', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'as-override.controller.ts',
    });

    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/api/crew');
  });
});

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

describe('discoverContractsFast — collision detection', () => {
  it('throws when two methods derive/assign to the same name', async () => {
    await expect(
      discoverContractsFast({
        cwd: fixturesDir,
        glob: 'collision.controller.ts',
      }),
    ).rejects.toThrow(/Route name collision/);
  });

  it('error message includes both conflicting method refs', async () => {
    await expect(
      discoverContractsFast({
        cwd: fixturesDir,
        glob: 'collision.controller.ts',
      }),
    ).rejects.toThrow(/CollisionController/);
  });
});

// ---------------------------------------------------------------------------
// deriveClassSegment unit tests
// ---------------------------------------------------------------------------

describe('deriveClassSegment', () => {
  it('UsersController → users', () => {
    expect(deriveClassSegment('UsersController')).toBe('users');
  });

  it('AdminUsersController → adminUsers', () => {
    expect(deriveClassSegment('AdminUsersController')).toBe('adminUsers');
  });

  it('class name with no Controller suffix is used as-is (first letter lowercased)', () => {
    expect(deriveClassSegment('Widgets')).toBe('widgets');
  });

  it('throws for a class named exactly Controller (empty segment after strip)', () => {
    expect(() => deriveClassSegment('Controller')).toThrow(/derives empty route segment/);
  });
});

// ---------------------------------------------------------------------------
// resolveRouteName unit tests
// ---------------------------------------------------------------------------

describe('resolveRouteName', () => {
  it('both absent → derives from class name and method name', () => {
    expect(resolveRouteName('CrewController', 'list', undefined, undefined)).toBe('crew.list');
  });

  it('class @As only → class portion overridden, method name used', () => {
    expect(resolveRouteName('CrewController', 'list', 'crew', undefined)).toBe('crew.list');
  });

  it('method @As only → class derived, method portion overridden', () => {
    expect(resolveRouteName('CrewMemberController', 'list', undefined, 'top10')).toBe(
      'crewMember.top10',
    );
  });

  it('class @As + method @As → both portions overridden', () => {
    expect(resolveRouteName('CrewController', 'list', 'crew', 'directory.fetch')).toBe(
      'crew.directory.fetch',
    );
  });

  it('class @As multi-segment + method @As → composes correctly', () => {
    expect(resolveRouteName('CrewController', 'list', 'crew.admin', 'top10')).toBe(
      'crew.admin.top10',
    );
  });
});

// ---------------------------------------------------------------------------
// Class-level @As integration tests
// ---------------------------------------------------------------------------

describe('discoverContractsFast — class-level @As', () => {
  it('class @As only: crew.list', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'class-as.controller.ts',
    });

    const route = routes.find((r) => r.name === 'crew.list');
    expect(route, 'crew.list route not found').toBeDefined();
    expect(route?.path).toBe('/api/crew');
  });

  it('method @As only: crewMember.top10', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'class-as.controller.ts',
    });

    const route = routes.find((r) => r.name === 'crewMember.top10');
    expect(route, 'crewMember.top10 route not found').toBeDefined();
    expect(route?.path).toBe('/api/crew-member');
  });

  it('class @As + method @As: crew.directory.fetch', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'class-as.controller.ts',
    });

    const route = routes.find((r) => r.name === 'crew.directory.fetch');
    expect(route, 'crew.directory.fetch route not found').toBeDefined();
    expect(route?.path).toBe('/api/crew2');
  });

  it('class @As multi-segment + method @As: crew.admin.top10', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'class-as.controller.ts',
    });

    const route = routes.find((r) => r.name === 'crew.admin.top10');
    expect(route, 'crew.admin.top10 route not found').toBeDefined();
    expect(route?.path).toBe('/api/crew-admin');
  });

  it('both absent: crewDefault.list (auto-derivation)', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'class-as.controller.ts',
    });

    const route = routes.find((r) => r.name === 'crewDefault.list');
    expect(route, 'crewDefault.list route not found').toBeDefined();
    expect(route?.path).toBe('/api/crew-default');
  });

  it('class @As with PascalCase produces name that fails emit-time segment validation', async () => {
    // resolveRouteName itself does not validate — validation is deferred to emit (emit-api.ts).
    // This test confirms the composed name contains the PascalCase segment 'Crew'.
    const name = resolveRouteName('InvalidClassAsController', 'list', 'Crew', undefined);
    expect(name).toBe('Crew.list');
    // Segment 'Crew' starts with uppercase, which emit-api validateNameSegment will reject.
    expect(name).toMatch(/^[A-Z]/);
  });
});
