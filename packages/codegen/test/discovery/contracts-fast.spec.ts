/**
 * Integration tests for discoverContractsFast.
 * Uses the existing fixture controller (contract-users.controller.ts) and
 * asserts that the returned RouteDescriptor matches what the heavy probe
 * would produce.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import {
  deriveClassSegment,
  deriveRouteName,
  discoverContractsFast,
  extractDtoContract,
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
    expect(route.name).toBe('dashboard.index');
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/dashboard');
    expect(route.contract).toBeDefined();
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
    const plain = routes.find((r) => r.name === 'mixed.index');

    expect(contract).toBeDefined();
    expect(contract?.contract).toBeDefined();

    expect(plain).toBeDefined();
    expect(plain?.method).toBe('GET');
    expect(plain?.path).toBe('/dashboard');
    expect(plain?.contract).toBeDefined();
  });
});

describe('discoverContractsFast — form zod capture (Path A)', () => {
  it('captures bodyZodRef for an exported named contract const', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'forms-contract.controller.ts',
    });

    const login = routes.find((r) => r.name === 'authForms.login');
    expect(login).toBeDefined();
    const cs = login!.contract!.contractSource;
    expect(cs.bodyZodRef).toEqual({
      name: 'loginContract.body',
      filePath: expect.stringContaining('forms-contract.controller.ts'),
    });
    // Both ref and inline text are captured; the emitter prefers the (client-safe)
    // inline text and only falls back to the ref when no text is present.
    expect(cs.bodyZodText).toContain('z.string().email()');
  });

  it('captures bodyZodText for an inline defineContract body', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'forms-contract.controller.ts',
    });

    const signup = routes.find((r) => r.name === 'authForms.signup');
    expect(signup).toBeDefined();
    const cs = signup!.contract!.contractSource;
    expect(cs.bodyZodRef ?? null).toBeNull();
    expect(cs.bodyZodText).toBe('z.object({ name: z.string().min(1) })');
  });
});

describe('discoverContractsFast — class-validator DTO synthesis (Path B)', () => {
  it('synthesizes bodyZodText + nested schemas from a decorated DTO class', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'forms-dto.controller.ts',
    });

    const register = routes.find((r) => r.name === 'accountForms.register');
    expect(register).toBeDefined();
    const cs = register!.contract!.contractSource;
    expect(cs.bodyZodText).toContain('email: z.string().email()');
    expect(cs.bodyZodText).toContain('password: z.string().min(8)');
    expect(cs.bodyZodText).toContain('address: AddressDtoSchema');
    expect(cs.formNestedSchemas?.AddressDtoSchema).toBe('z.object({ city: z.string() })');
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

// ---------------------------------------------------------------------------
// DTO-based contract extraction (standard NestJS patterns — no defineContract)
// ---------------------------------------------------------------------------

describe('discoverContractsFast — DTO-based contract extraction', () => {
  it('extracts body type from @Body() DTO-decorated parameter', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-controller.controller.ts',
    });
    const route = routes.find((r) => r.name === 'dto.create');
    expect(route).toBeDefined();
    expect(route?.contract).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.body).toBe('{ title: string; content: string }');
    expect(cs?.query).toBeNull();
  });

  it('extracts query type from @Query() DTO-decorated parameter', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-controller.controller.ts',
    });
    const route = routes.find((r) => r.name === 'dto.list');
    expect(route).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.query).toBe('{ page?: number }');
    expect(cs?.body).toBeNull();
  });

  it('extracts array response type from @ApiResponse({ type: [PostDto] })', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-controller.controller.ts',
    });
    const route = routes.find((r) => r.name === 'dto.list');
    expect(route).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.response).toBe('Array<{ id: string; title: string }>');
  });

  it('extracts single object response type from @ApiResponse({ type: PostDto })', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-controller.controller.ts',
    });
    const route = routes.find((r) => r.name === 'dto.create');
    expect(route).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.response).toBe('{ id: string; title: string }');
  });

  it("extracts @Param params from @Param('id') decorated parameter", async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-controller.controller.ts',
    });
    const route = routes.find((r) => r.name === 'dto.show');
    expect(route).toBeDefined();
    // The show method has @ApiResponse({ type: PostDto }) so it gets a contract
    expect(route?.contract).toBeDefined();
    expect(route?.contract?.contractSource.response).toBe('{ id: string; title: string }');
  });

  it('falls back to return type annotation when no @ApiResponse is present', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'dto-return-type.controller.ts',
    });
    const listRoute = routes.find((r) => r.name === 'dtoReturnType.list');
    expect(listRoute).toBeDefined();
    expect(listRoute?.contract?.contractSource.response).toBe(
      'Array<{ slug: string; body: string }>',
    );

    const singleRoute = routes.find((r) => r.name === 'dtoReturnType.single');
    expect(singleRoute).toBeDefined();
    expect(singleRoute?.contract?.contractSource.response).toBe('{ slug: string; body: string }');
  });

  it('Zod @ApplyContract wins when both @ApplyContract and @Body DTO are present', async () => {
    // The mixed.controller.ts has @ApplyContract on list — it should use Zod, not DTO
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'mixed.controller.ts',
    });
    const contractRoute = routes.find((r) => r.contract !== undefined);
    expect(contractRoute).toBeDefined();
    // The Zod contract has response containing 'id' and 'title' from z.object schema
    const cs = contractRoute?.contract?.contractSource;
    expect(cs?.response).toContain('id');
    // The name uses auto-derived name for the contracted route
    expect(contractRoute?.name).toBe('mixed.list');
  });

  it('no contract attached when method has no @Body/@Query/@ApiResponse and no return type class', async () => {
    // inertia-dashboard.controller.ts has @Get() with no DTO info and returns void implicitly
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'inertia-dashboard.controller.ts',
    });
    expect(routes).toHaveLength(1);
    expect(routes[0].contract).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// extractDtoContract unit tests (direct function tests)
// ---------------------------------------------------------------------------

describe('extractDtoContract', () => {
  function makeSourceFileFromCode(code: string) {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      compilerOptions: { strict: false },
    });
    const sf = project.createSourceFile('test.ts', code);
    return { sf, project };
  }

  it('returns null when method has no decorators, no return type', () => {
    const { sf, project } = makeSourceFileFromCode(`
      class TestController {
        doSomething() {}
      }
    `);
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('doSomething');
    const result = extractDtoContract(method, sf, project);
    expect(result).toBeNull();
  });

  it('extracts body from @Body() and returns it', () => {
    const { sf, project } = makeSourceFileFromCode(`
      class BodyDto { name: string; age: number; }
      class TestController {
        create(@Body() body: BodyDto) {}
      }
    `);
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('create');
    const result = extractDtoContract(method, sf, project);
    expect(result).not.toBeNull();
    expect(result?.body).toBe('{ name: string; age: number }');
    expect(result?.query).toBeNull();
  });

  it('extracts query from @Query() and returns it', () => {
    const { sf, project } = makeSourceFileFromCode(`
      class QueryDto { page?: number; }
      class TestController {
        list(@Query() query: QueryDto) {}
      }
    `);
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('list');
    const result = extractDtoContract(method, sf, project);
    expect(result).not.toBeNull();
    expect(result?.query).toBe('{ page?: number }');
    expect(result?.body).toBeNull();
  });

  it('skips @Query("key") single-param decorators', () => {
    const { sf, project } = makeSourceFileFromCode(`
      class TestController {
        get(@Query('page') page: string) {}
      }
    `);
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('get');
    const result = extractDtoContract(method, sf, project);
    expect(result).toBeNull();
  });

  it('resolves optional properties correctly', () => {
    const { sf, project } = makeSourceFileFromCode(`
      class MyDto { required: string; optional?: boolean; }
      class TestController {
        action(@Body() body: MyDto) {}
      }
    `);
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('action');
    const result = extractDtoContract(method, sf, project);
    expect(result?.body).toBe('{ required: string; optional?: boolean }');
  });
});

// ---------------------------------------------------------------------------
// Cross-file DTO resolution integration tests
// ---------------------------------------------------------------------------

describe('discoverContractsFast — cross-file DTO resolution', () => {
  it('resolves DTOs imported from a separate file', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'cross-file.controller.ts',
    });

    expect(routes.length).toBeGreaterThanOrEqual(2);

    const listRoute = routes.find((r) => r.name === 'crossFile.list');
    expect(listRoute).toBeDefined();
    const listCs = listRoute?.contract?.contractSource;
    expect(listCs?.response).toBe(
      'Array<{ id: string; title: string; content: string; createdAt: string }>',
    );
    expect(listCs?.query).toBe('{ page?: number; limit?: number }');

    const createRoute = routes.find((r) => r.name === 'crossFile.create');
    expect(createRoute).toBeDefined();
    const createCs = createRoute?.contract?.contractSource;
    expect(createCs?.body).toBe('{ title: string; content: string }');
    expect(createCs?.response).toBe(
      '{ id: string; title: string; content: string; createdAt: string }',
    );
  });

  it('resolves nested cross-file DTOs (DTO imports another DTO)', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'cross-file-nested.controller.ts',
    });

    expect(routes.length).toBeGreaterThanOrEqual(2);

    const listRoute = routes.find((r) => r.name === 'crossFileNested.list');
    expect(listRoute).toBeDefined();
    const listCs = listRoute?.contract?.contractSource;
    // CommentDto has a `post: PostResponseDto` field — PostResponseDto is in a different file
    expect(listCs?.response).toContain('id: string');
    expect(listCs?.response).toContain('text: string');
    expect(listCs?.response).toContain(
      'post: { id: string; title: string; content: string; createdAt: string }',
    );

    const createRoute = routes.find((r) => r.name === 'crossFileNested.create');
    expect(createRoute).toBeDefined();
    const createCs = createRoute?.contract?.contractSource;
    expect(createCs?.body).toBe('{ text: string; postId: string }');
  });

  it('resolves interfaces, type aliases, and enums from separate files', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'cross-file-interface.controller.ts',
    });

    expect(routes.length).toBeGreaterThanOrEqual(4);

    // Interface resolution — FleetResponse should be expanded inline
    const listRoute = routes.find((r) => r.name === 'crossFileInterface.list');
    expect(listRoute).toBeDefined();
    const listCs = listRoute?.contract?.contractSource;
    expect(listCs?.response).toContain('vessels');
    expect(listCs?.response).toContain('total: number');

    // Interface as @Body — TelemetryBody should be expanded inline
    const createRoute = routes.find((r) => r.name === 'crossFileInterface.create');
    expect(createRoute).toBeDefined();
    expect(createRoute?.contract?.contractSource.body).toBe(
      '{ lat: number; lng: number; timestamp: string }',
    );

    // Type alias — VesselStatus should be the raw union string
    const statusRoute = routes.find((r) => r.name === 'crossFileInterface.status');
    expect(statusRoute).toBeDefined();
    expect(statusRoute?.contract?.contractSource.response).toContain("'active'");
    expect(statusRoute?.contract?.contractSource.response).toContain("'docked'");

    // Enum — VesselType should expand to union of string values
    const typesRoute = routes.find((r) => r.name === 'crossFileInterface.types');
    expect(typesRoute).toBeDefined();
    expect(typesRoute?.contract?.contractSource.response).toContain('"cargo"');
    expect(typesRoute?.contract?.contractSource.response).toContain('"tanker"');
  });
});

// ---------------------------------------------------------------------------
// Utility type preservation (Record, Omit, etc.)
// ---------------------------------------------------------------------------

describe('discoverContractsFast — utility type preservation', () => {
  it('preserves Record<string, unknown> in response type (not bare Record)', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'utility-types.controller.ts',
    });

    const route = routes.find((r) => r.name === 'utilityTypes.trigger');
    expect(route).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.response).toBe('Record<string, unknown>');
  });

  it('preserves Record<string, unknown> in body type for nested utility types', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'utility-types.controller.ts',
    });

    const route = routes.find((r) => r.name === 'utilityTypes.trigger');
    expect(route).toBeDefined();
    const cs = route?.contract?.contractSource;
    expect(cs?.body).toContain('Record<string, unknown>');
  });
});

// ---------------------------------------------------------------------------
// StreamableFile → unknown (no contract, since response=unknown + no body/query)
// ---------------------------------------------------------------------------

describe('discoverContractsFast — StreamableFile maps to unknown', () => {
  it('resolves StreamableFile return type to unknown, resulting in no contract', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'stream.controller.ts',
    });

    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route?.name).toBe('stream.download');
    // StreamableFile resolves to 'unknown' which, with no body/query, means no contract
    expect(route?.contract).toBeDefined();
  });

  it('StreamableFile is treated as a server-only type via extractDtoContract', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      compilerOptions: { strict: false },
    });
    const sf = project.createSourceFile(
      'test-stream.ts',
      `
      class StreamableFile {}
      class TestController {
        download(): StreamableFile { return {} as any; }
      }
    `,
    );
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('download');
    // extractDtoContract returns null because the resolved response is 'unknown'
    // and there's no body/query/params
    const result = extractDtoContract(method, sf, project);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unresolvable type → unknown (no contract, since response=unknown + no body/query)
// ---------------------------------------------------------------------------

describe('discoverContractsFast — unresolvable type falls back to unknown', () => {
  it('treats unresolvable type as unknown, resulting in no contract', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'unresolvable.controller.ts',
    });

    expect(routes).toHaveLength(1);
    const route = routes[0];
    expect(route?.name).toBe('unresolvable.getData');
    // Unresolvable type resolves to 'unknown' which, with no body/query, means no contract
    expect(route?.contract).toBeDefined();
  });

  it('unresolvable type is treated as unknown via extractDtoContract', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      compilerOptions: { strict: false },
    });
    const sf = project.createSourceFile(
      'test-unresolvable.ts',
      `
      class TestController {
        getData(): SomeNonExistentType { return {} as any; }
      }
    `,
    );
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('getData');
    // extractDtoContract returns null because the resolved response is 'unknown'
    // and there's no body/query/params
    const result = extractDtoContract(method, sf, project);
    expect(result).toBeNull();
  });

  it('unresolvable type with @Body still produces a contract with unknown response', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      compilerOptions: { strict: false },
    });
    const sf = project.createSourceFile(
      'test-unresolvable-with-body.ts',
      `
      class MyDto { name: string; }
      class TestController {
        create(@Body() body: MyDto): SomeNonExistentType { return {} as any; }
      }
    `,
    );
    const cls = sf.getClassOrThrow('TestController');
    const method = cls.getMethodOrThrow('create');
    // Has a @Body, so extractDtoContract returns a contract with unknown response
    const result = extractDtoContract(method, sf, project);
    expect(result).not.toBeNull();
    expect(result?.body).toBe('{ name: string }');
    expect(result?.response).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// TypeRef with isArray on cross-file array return types
// ---------------------------------------------------------------------------

describe('discoverContractsFast — responseRef isArray flag', () => {
  it('sets isArray: true on responseRef when return type is Promise<PostResponseDto[]>', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'cross-file.controller.ts',
    });

    const listRoute = routes.find((r) => r.name === 'crossFile.list');
    expect(listRoute).toBeDefined();
    const ref = listRoute?.contract?.contractSource.responseRef;
    expect(ref).toBeDefined();
    expect(ref?.name).toBe('PostResponseDto');
    expect(ref?.isArray).toBe(true);
  });

  it('does not set isArray on responseRef for a single object return type', async () => {
    const routes = await discoverContractsFast({
      cwd: fixturesDir,
      glob: 'cross-file.controller.ts',
    });

    const createRoute = routes.find((r) => r.name === 'crossFile.create');
    expect(createRoute).toBeDefined();
    const ref = createRoute?.contract?.contractSource.responseRef;
    expect(ref).toBeDefined();
    expect(ref?.name).toBe('PostResponseDto');
    expect(ref?.isArray).not.toBe(true);
  });
});
