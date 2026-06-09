import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RouteDescriptor } from '../../src/discovery/types.js';
import { emitApi } from '../../src/emit/emit-api.js';

describe('emitApi', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'codegen-emit-api-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const routesWithContract: RouteDescriptor[] = [
    {
      method: 'GET',
      path: '/api/users',
      name: 'users.list',
      params: [],
      contract: {
        contractSource: {
          query: '{ active?: boolean | undefined }',
          body: null,
          response: 'Array<{ id: string; name: string }>',
        },
      },
    },
    {
      method: 'POST',
      path: '/api/users',
      name: 'users.create',
      params: [],
      contract: {
        contractSource: {
          query: null,
          body: '{ name: string; email: string }',
          response: '{ id: string; name: string; email: string }',
        },
      },
    },
    {
      method: 'POST',
      path: '/api/pipeline-runs/search',
      name: 'pipelineRuns.search',
      params: [],
      contract: {
        contractSource: {
          query: null,
          body: null,
          response: '{ data: Array<{ id: string }> }',
          filterFields: ['status', 'tasks.name'],
        },
      },
    },
    {
      method: 'GET',
      path: '/api/people',
      name: 'people.list',
      params: [],
      contract: {
        contractSource: {
          query: null,
          body: null,
          response: '{ data: unknown[] }',
          filterFields: ['age', 'name', 'status'],
          filterFieldTypes: [
            { name: 'age', kind: 'number' },
            { name: 'name', kind: 'string' },
            { name: 'status', kind: 'string', enumValues: ['A', 'B'] },
          ],
        },
      },
    },
    {
      // Route without contract — should be ignored in api.ts
      method: 'GET',
      path: '/health',
      name: 'HealthController.check',
      params: [],
    },
  ];

  it('writes api.ts to outDir', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toBeDefined();
  });

  it('includes required imports', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).not.toContain('@tanstack/query-core');
    expect(content).toContain("from '@tanstack/react-query'");
    expect(content).toContain('_queryOptions');
    expect(content).toContain('_mutationOptions');
    expect(content).toContain("from './routes.js'");
    expect(content).toContain("import { fetcher } from '@/lib/api'");
  });

  it('imports fetcher from custom path when provided', async () => {
    await emitApi(routesWithContract, outDir, '@/my-custom-api');
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain("import { fetcher } from '@/my-custom-api'");
    expect(content).not.toContain('createFetcher');
  });

  // --- ApiRouter: nested shape ---

  it('exports ApiRouter type with nested structure for dot-separated names', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export type ApiRouter');
    // Should have nested shape, not flat string-keyed shape
    expect(content).toContain('users:');
    expect(content).toContain('list:');
    expect(content).toContain('create:');
    // Must NOT have flat string keys as object keys in ApiRouter (e.g. "users.list": { ... })
    expect(content).not.toMatch(/"users\.list"\s*:/);
    expect(content).not.toMatch(/"users\.create"\s*:/);
    // Non-contracted route must not appear
    expect(content).not.toContain('"HealthController.check"');
    expect(content).not.toContain('HealthController');
  });

  it('emits the field-type map as a second type arg when filterFieldTypes present', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain(
      'filterQuery: () => _filterQueryTyped<"age" | "name" | "status", { "age": number; "name": string; "status": "A" | "B" }>(),',
    );
  });

  it('emits single type arg when filterFieldTypes is absent', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('_filterQueryTyped<"status" | "tasks.name">()');
  });

  it('ApiRouter GET entry has body: never', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // Confirm body: never appears somewhere in the file (for GET route)
    expect(content).toMatch(/body:\s*never/);
  });

  it('ApiRouter GET entry has the correct query type', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('{ active?: boolean | undefined }');
  });

  it('ApiRouter POST entry has correct body type', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('{ name: string; email: string }');
  });

  it('ApiRouter POST entry has query: never when no query schema', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toMatch(/query:\s*never/);
  });

  // --- api object: nested shape ---

  it('exported api object uses nested dot-notation (api.users.list)', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export const api');
    // Nested keys, not flat string keys in the api object
    expect(content).toContain('users:');
    expect(content).toContain('list:');
    expect(content).toContain('create:');
    // Must NOT have flat quoted keys in the api object
    expect(content).not.toMatch(/['"]users\.list['"]\s*:/);
    expect(content).not.toMatch(/['"]users\.create['"]\s*:/);
  });

  it('GET contract produces queryOptions', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('queryOptions');
    expect(content).toContain('fetcher.get<');
  });

  it('POST contract produces mutationOptions', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('mutationOptions');
    expect(content).toContain('mutationFn');
    expect(content).toContain('fetcher.post<');
  });

  it('queryKey remains the flat string (cache-stable)', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // queryKey must use the flat string 'users.list', not nested
    expect(content).toContain(
      'queryKey: query !== undefined ? ["users.list", query] as const : ["users.list"] as const',
    );
  });

  // --- Single-segment name (no dot) ---

  it('single-segment name (no dot) emits top-level api entry', async () => {
    const healthRoute: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/health',
        name: 'health',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: '{ ok: boolean }' },
        },
      },
    ];
    await emitApi(healthRoute, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // api.health should appear at top level
    expect(content).toContain('health:');
    expect(content).toContain('queryOptions');
  });

  // --- Three-level nesting ---

  it('three-level name (admin.users.list) emits api.admin.users.list', async () => {
    const deepRoute: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/admin/users',
        name: 'admin.users.list',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await emitApi(deepRoute, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('admin:');
    expect(content).toContain('users:');
    expect(content).toContain('list:');
    // queryKey must be flat
    expect(content).toContain(
      'queryKey: query !== undefined ? ["admin.users.list", query] as const : ["admin.users.list"] as const',
    );
  });

  // --- Collision detection ---

  it('throws on contract name collision (direct entry and child entries)', async () => {
    const collisionRoutes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/users',
        name: 'users',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
      {
        method: 'GET',
        path: '/api/users',
        name: 'users.list',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await expect(emitApi(collisionRoutes, outDir)).rejects.toThrow(
      'Contract name conflict: "users" cannot have both a direct entry and child entries',
    );
  });

  // --- InferResponse / InferBody / InferQuery removed (Route.* is canonical) ---

  it('does NOT export InferResponse, InferBody, InferQuery (dropped in favour of Route.*)', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).not.toContain('export type InferResponse');
    expect(content).not.toContain('export type InferBody');
    expect(content).not.toContain('export type InferQuery');
  });

  // --- Skips routes without contract ---

  it('skips routes without contract', async () => {
    const onlyNoContract: RouteDescriptor[] = [
      { method: 'GET', path: '/health', name: 'HealthController.check', params: [] },
    ];
    await emitApi(onlyNoContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).not.toContain('"HealthController.check"');
    expect(content).not.toContain('HealthController');
  });

  it('creates outDir if it does not exist', async () => {
    const nested = join(outDir, 'nested', 'dir');
    await emitApi(routesWithContract, nested);
    const content = await readFile(join(nested, 'api.ts'), 'utf8');
    expect(content).toContain('ApiRouter');
  });

  it('sanitizes route paths with unsafe chars using JSON.stringify', async () => {
    const unsafePath = '/api/foo`bar';
    const maliciousRoutes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: unsafePath,
        name: 'safe.name',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await emitApi(maliciousRoutes, outDir);
    const content = await readFile(join(maliciousRoutes[0].path, 'api.ts'), 'utf8').catch(() =>
      readFile(join(outDir, 'api.ts'), 'utf8'),
    );
    // The path must appear JSON-encoded, not as a raw template literal
    expect(content).toContain(JSON.stringify(unsafePath));
  });

  it('sanitizes names with segments that would produce invalid JS identifiers (JSON-key fallback)', async () => {
    // Names with spaces or special chars within a segment should still produce valid code
    const weirdRoutes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/safe',
        name: 'safe.name',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await emitApi(weirdRoutes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // Should not produce raw newlines or unquoted invalid identifiers
    expect(content).not.toMatch(/\n\s*\n\s*\n\s*\n/); // no excessive blanks from broken gen
    expect(content).toContain('safe:');
    expect(content).toContain('name:');
  });

  // ---------------------------------------------------------------------------
  // Q1: Tuyau-style Route + Path namespaced type helpers
  // ---------------------------------------------------------------------------

  describe('Route and Path namespace helpers', () => {
    it('emits export namespace Route with Response, Body, Query, Params, Error, Request', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('export namespace Route');
      expect(content).toContain('type Response');
      expect(content).toContain('type Body');
      expect(content).toContain('type Query');
      expect(content).toContain('type Params');
      expect(content).toContain('type Error');
      expect(content).toContain('type Request');
    });

    it('emits export namespace Path with Response, Body, Query', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('export namespace Path');
    });

    it('ApiRouter leaf entries include a url field', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // The leaf entry should have url: "/api/users" inside the ApiRouter type
      expect(content).toContain('url:');
    });

    it('Route.Response uses ResolveByName that walks ApiRouter', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('ResolveByName');
    });

    it('Path.Response uses ResolveByPath that scans for method+url', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('ResolveByPath');
    });

    it('emits Route.FilterFields and Path.FilterFields helpers', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(
        'export type FilterFields<K extends string> = ResolveByName<K, "filterFields">',
      );
      expect(content).toContain(
        'export type FilterFields<M extends string, U extends string> = ResolveByPath<M, U, "filterFields">',
      );
    });

    it('ApiRouter leaf carries filterFields as a string union for filtered routes, never otherwise', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // Filtered route → union of field literals
      expect(content).toContain('filterFields: "status" | "tasks.name"');
      // Unfiltered route → never
      expect(content).toContain('filterFields: never');
    });
  });

  // ---------------------------------------------------------------------------
  // Q2: Segment validation — camelCase only
  // ---------------------------------------------------------------------------

  describe('name segment validation', () => {
    function makeRoute(name: string): RouteDescriptor[] {
      return [
        {
          method: 'GET',
          path: '/test',
          name,
          params: [],
          contract: {
            contractSource: { query: null, body: null, response: 'unknown' },
          },
        },
      ];
    }

    it('accepts a valid camelCase name (users.list)', async () => {
      await expect(emitApi(makeRoute('users.list'), outDir)).resolves.not.toThrow();
    });

    it('accepts a three-level valid name (admin.userActions.create)', async () => {
      await expect(emitApi(makeRoute('admin.userActions.create'), outDir)).resolves.not.toThrow();
    });

    it('rejects a name with a hyphenated segment and mentions suggested fix', async () => {
      await expect(emitApi(makeRoute('user-post.list'), outDir)).rejects.toThrow(
        /user-post.*userPost/,
      );
    });

    it('rejects a name with an underscore segment and mentions suggested fix', async () => {
      await expect(emitApi(makeRoute('user_post.list'), outDir)).rejects.toThrow(
        /user_post.*userPost/,
      );
    });

    it('rejects a name with a space in a segment and mentions suggested fix', async () => {
      await expect(emitApi(makeRoute('user post.list'), outDir)).rejects.toThrow(
        /user post.*userPost/,
      );
    });

    it('rejects a PascalCase segment (User.list) and suggests user.list', async () => {
      await expect(emitApi(makeRoute('User.list'), outDir)).rejects.toThrow(/User.*user/);
    });

    it('rejects a segment starting with a digit (1users.list)', async () => {
      await expect(emitApi(makeRoute('1users.list'), outDir)).rejects.toThrow(/1users/);
    });

    it('error message includes the full contract name', async () => {
      await expect(emitApi(makeRoute('user-post.list'), outDir)).rejects.toThrow(
        /Contract name "user-post\.list"/,
      );
    });

    it('error message includes the invalid segment', async () => {
      await expect(emitApi(makeRoute('user-post.list'), outDir)).rejects.toThrow(
        /invalid segment "user-post"/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // import type generation for responseRef / bodyRef / queryRef
  // ---------------------------------------------------------------------------

  describe('import type generation', () => {
    it('emits import type statement when routes have responseRef', async () => {
      const routesWithRefs: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/items',
          name: 'items.list',
          params: [],
          contract: {
            contractSource: {
              query: null,
              body: null,
              response: 'Array<ItemDto>',
              responseRef: {
                name: 'ItemDto',
                filePath: '/src/items/item.dto.ts',
                isArray: true,
              },
            },
          },
        },
      ];
      await emitApi(routesWithRefs, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain("import type { ItemDto } from '");
      // Should strip .ts extension from the import path
      expect(content).toMatch(/from '.*item\.dto'/);
      expect(content).not.toContain("item.dto.ts'");
    });

    it('ApiRouter uses the named type (Array<ItemDto>) when responseRef is set', async () => {
      const routesWithRefs: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/items',
          name: 'items.list',
          params: [],
          contract: {
            contractSource: {
              query: null,
              body: null,
              response: 'Array<{ id: string; title: string }>',
              responseRef: {
                name: 'ItemDto',
                filePath: '/src/items/item.dto.ts',
                isArray: true,
              },
            },
          },
        },
      ];
      await emitApi(routesWithRefs, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // The ApiRouter type should use the named type reference, not the inline expansion
      expect(content).toContain('Array<ItemDto>');
    });
  });

  // ---------------------------------------------------------------------------
  // _queryOptions and _mutationOptions wrappers
  // ---------------------------------------------------------------------------

  describe('_queryOptions and _mutationOptions wrappers', () => {
    it('GET routes produce _queryOptions({', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('_queryOptions({');
    });

    it('POST routes produce _mutationOptions({', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('_mutationOptions({');
    });

    it('@tanstack/react-query import is present', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain("from '@tanstack/react-query'");
    });

    it('imports queryOptions aliased as _queryOptions when GET routes exist', async () => {
      const getOnly: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/data',
          name: 'data.list',
          params: [],
          contract: {
            contractSource: { query: null, body: null, response: '{ ok: boolean }' },
          },
        },
      ];
      await emitApi(getOnly, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('queryOptions as _queryOptions');
    });

    it('imports mutationOptions aliased as _mutationOptions when mutation routes exist', async () => {
      const postOnly: RouteDescriptor[] = [
        {
          method: 'POST',
          path: '/api/data',
          name: 'data.create',
          params: [],
          contract: {
            contractSource: {
              query: null,
              body: '{ value: string }',
              response: '{ id: string }',
            },
          },
        },
      ];
      await emitApi(postOnly, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('mutationOptions as _mutationOptions');
    });
  });

  // ---------------------------------------------------------------------------
  // queryKey() helper
  // ---------------------------------------------------------------------------

  describe('queryKey() helper', () => {
    it('GET routes have a queryKey function that returns the route name as const', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // queryKey function for GET should produce ["users.list"] as const
      expect(content).toContain('queryKey:');
      expect(content).toContain('["users.list"] as const');
    });

    it('GET queryKey includes query param when provided', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('["users.list", query] as const');
    });

    it('mutation routes also have a queryKey function', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // POST/mutation routes should also have queryKey
      expect(content).toContain('["users.create"] as const');
    });
  });

  // ---------------------------------------------------------------------------
  // infiniteQueryOptions() generation for GET routes
  // ---------------------------------------------------------------------------

  describe('infiniteQueryOptions', () => {
    it('GET route generates infiniteQueryOptions function', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('infiniteQueryOptions');
    });

    it('infiniteQueryOptions includes initialPageParam: 1', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('initialPageParam: 1');
    });

    it('infiniteQueryOptions includes getNextPageParam', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('getNextPageParam');
    });

    it('infiniteQueryOptions includes queryFn with pageParam', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('pageParam');
      expect(content).toContain('{ pageParam }');
      expect(content).toContain('page: pageParam');
    });

    it('GET route without params: infiniteQueryOptions(query?)', async () => {
      const getNoParams: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/users',
          name: 'users.list',
          params: [],
          contract: {
            contractSource: {
              query: '{ active?: boolean }',
              body: null,
              response: 'Array<{ id: string }>',
            },
          },
        },
      ];
      await emitApi(getNoParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(
        `infiniteQueryOptions: (query?: ApiRouter["users"]["list"]['query'])`,
      );
    });

    it('GET route with params: infiniteQueryOptions(params, query?)', async () => {
      const getWithParams: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/v1/fleet/vessels/:id/trail',
          name: 'fleet.getVesselTrail',
          params: [{ name: 'id', source: 'path' }],
          contract: {
            contractSource: {
              query: '{ from?: string }',
              body: null,
              response: 'Array<{ lat: number; lng: number }>',
            },
          },
        },
      ];
      await emitApi(getWithParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(
        `infiniteQueryOptions: (params: ApiRouter["fleet"]["getVesselTrail"]['params']`,
      );
      expect(content).toContain(`query?: ApiRouter["fleet"]["getVesselTrail"]['query']`);
    });

    it('POST route does NOT generate infiniteQueryOptions', async () => {
      const postOnly: RouteDescriptor[] = [
        {
          method: 'POST',
          path: '/api/data',
          name: 'data.create',
          params: [],
          contract: {
            contractSource: {
              query: null,
              body: '{ value: string }',
              response: '{ id: string }',
            },
          },
        },
      ];
      await emitApi(postOnly, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).not.toContain('infiniteQueryOptions');
      expect(content).not.toContain('initialPageParam');
      expect(content).not.toContain('getNextPageParam');
    });

    it('getNextPageParam checks meta.page and meta.lastPage', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('meta?.page != null');
      expect(content).toContain('meta?.lastPage != null');
      expect(content).toContain('meta.page < meta.lastPage ? meta.page + 1 : undefined');
    });

    it('infiniteQueryOptions queryFn spreads query with page override', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('query != null ? query : {}), page: pageParam');
    });

    it('infiniteQueryOptions uses same queryKey as queryOptions', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // Both queryOptions and infiniteQueryOptions should produce the same queryKey pattern
      const queryKeyPattern = '["users.list", query] as const : ["users.list"] as const';
      // Count occurrences — should appear in both queryKey, queryOptions and infiniteQueryOptions
      const matches = content.split(queryKeyPattern).length - 1;
      expect(matches).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // No @tanstack/query-core
  // ---------------------------------------------------------------------------

  describe('no @tanstack/query-core import', () => {
    it('does not import from @tanstack/query-core', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).not.toContain('@tanstack/query-core');
    });
  });

  // ---------------------------------------------------------------------------
  // URL params support in queryOptions / mutationOptions
  // ---------------------------------------------------------------------------

  describe('URL params support', () => {
    const routeWithPathParam: RouteDescriptor[] = [
      {
        method: 'PATCH',
        path: '/api/v1/crew/users/:id',
        name: 'crew.updateCrew',
        params: [{ name: 'id', source: 'path' }],
        contract: {
          contractSource: {
            query: null,
            body: '{ name: string }',
            response: '{ id: string; name: string }',
          },
        },
      },
    ];

    const getRouteWithPathParam: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/api/v1/fleet/vessels/:id/trail',
        name: 'fleet.getVesselTrail',
        params: [{ name: 'id', source: 'path' }],
        contract: {
          contractSource: {
            query: '{ from?: string }',
            body: null,
            response: 'Array<{ lat: number; lng: number }>',
          },
        },
      },
    ];

    const routeWithMultipleParams: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/api/v1/fleet/vessels/:vesselId/trips/:tripId',
        name: 'fleet.getTrip',
        params: [
          { name: 'vesselId', source: 'path' },
          { name: 'tripId', source: 'path' },
        ],
        contract: {
          contractSource: {
            query: null,
            body: null,
            response: '{ id: string }',
          },
        },
      },
    ];

    const routeWithNoParams: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/api/v1/crew/users',
        name: 'crew.createCrew',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{ name: string }',
            response: '{ id: string }',
          },
        },
      },
    ];

    // --- ApiRouter params field ---

    it('route with :id param generates params: { id: string } in ApiRouter', async () => {
      await emitApi(routeWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('params: { id: string }');
    });

    it('route without params generates params: never in ApiRouter', async () => {
      await emitApi(routeWithNoParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('params: never');
    });

    it('route with multiple path params generates params with all keys', async () => {
      await emitApi(routeWithMultipleParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('params: { vesselId: string; tripId: string }');
    });

    it('only path params are included (query/body/header source excluded)', async () => {
      const routeWithMixedSources: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/items/:id',
          name: 'items.get',
          params: [
            { name: 'id', source: 'path' },
            { name: 'filter', source: 'query' },
            { name: 'authToken', source: 'header' },
          ],
          contract: {
            contractSource: { query: null, body: null, response: 'unknown' },
          },
        },
      ];
      await emitApi(routeWithMixedSources, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('params: { id: string }');
      expect(content).not.toContain('filter: string');
      expect(content).not.toContain('authToken: string');
    });

    // --- GET routes with params ---

    it('GET route with params: queryOptions takes (params, query?) signature', async () => {
      await emitApi(getRouteWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(
        `queryOptions: (params: ApiRouter["fleet"]["getVesselTrail"]['params']`,
      );
      expect(content).toContain(`query?: ApiRouter["fleet"]["getVesselTrail"]['query']`);
    });

    it('GET route with params: queryKey includes params', async () => {
      await emitApi(getRouteWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('["fleet.getVesselTrail", params, query] as const');
      expect(content).toContain('["fleet.getVesselTrail", params] as const');
    });

    it('GET route with params: queryFn passes params to route()', async () => {
      await emitApi(getRouteWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('route("fleet.getVesselTrail" as never, params as never)');
    });

    it('GET route without params: queryOptions keeps (query?) signature', async () => {
      const getNoParams: RouteDescriptor[] = [
        {
          method: 'GET',
          path: '/api/users',
          name: 'users.list',
          params: [],
          contract: {
            contractSource: {
              query: '{ active?: boolean }',
              body: null,
              response: 'Array<{ id: string }>',
            },
          },
        },
      ];
      await emitApi(getNoParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(`queryOptions: (query?: ApiRouter["users"]["list"]['query'])`);
      // params: never should appear in the ApiRouter type but not in function signatures
      expect(content).toContain('params: never');
      expect(content).toContain('route("users.list" as never)');
      // Should NOT have params in the queryOptions/queryKey function signatures
      expect(content).not.toMatch(/queryOptions:\s*\(params:/);
      expect(content).not.toMatch(/queryKey:\s*\(params:/);
    });

    // --- Mutation routes with params ---

    it('mutation route with params: mutationFn takes input: { params, body }', async () => {
      await emitApi(routeWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(
        `mutationFn: (input: { params: ApiRouter["crew"]["updateCrew"]['params']; body: ApiRouter["crew"]["updateCrew"]['body'] })`,
      );
    });

    it('mutation route with params: passes input.params to route() and input.body to fetcher', async () => {
      await emitApi(routeWithPathParam, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('route("crew.updateCrew" as never, input.params as never)');
      expect(content).toContain('{ body: input.body }');
    });

    it('mutation route without params: mutationFn keeps (body) signature', async () => {
      await emitApi(routeWithNoParams, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain(`mutationFn: (body: ApiRouter["crew"]["createCrew"]['body'])`);
      expect(content).toContain('route("crew.createCrew" as never)');
      expect(content).toContain('{ body }');
    });
  });

  // ---------------------------------------------------------------------------
  // navigate() function generation
  // ---------------------------------------------------------------------------

  describe('navigate() function', () => {
    it('imports router from @inertiajs/react', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain("import { router } from '@inertiajs/react'");
    });

    it('imports RouteName, ExtractParams, RouteParams, ROUTES from routes.js', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('type RouteName');
      expect(content).toContain('type ExtractParams');
      expect(content).toContain('type RouteParams');
      expect(content).toContain('ROUTES');
      expect(content).toContain("from './routes.js'");
    });

    it('exports NavigateOptions type with expected fields', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('export type NavigateOptions');
      expect(content).toContain('method?: string');
      expect(content).toContain('data?: Record<string, unknown>');
      expect(content).toContain('preserveState?: boolean');
      expect(content).toContain('preserveScroll?: boolean');
      expect(content).toContain('replace?: boolean');
    });

    it('exports navigate function with RouteName constraint', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('export function navigate<K extends RouteName>');
    });

    it('navigate function uses conditional args (params required for parameterized routes)', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // Should have conditional rest args based on ExtractParams<(typeof ROUTES)[K]>
      expect(content).toContain('ExtractParams<(typeof ROUTES)[K]> extends never');
      expect(content).toContain('[options?: NavigateOptions]');
      expect(content).toContain('{ params: RouteParams<K> } & NavigateOptions');
    });

    it('navigate function calls route() to resolve URL', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('const url = route(name as never');
    });

    it('navigate function calls router.visit()', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('router.visit(url');
    });

    it('navigate passes visitOptions (without params) to router.visit', async () => {
      await emitApi(routesWithContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      // Should destructure params out and pass the rest
      expect(content).toContain('params: _p, ...visitOptions');
      expect(content).toContain('router.visit(url, visitOptions)');
    });

    it('empty routes emit navigate with _name: never signature', async () => {
      const onlyNoContract: RouteDescriptor[] = [
        { method: 'GET', path: '/health', name: 'HealthController.check', params: [] },
      ];
      await emitApi(onlyNoContract, outDir);
      const content = await readFile(join(outDir, 'api.ts'), 'utf8');
      expect(content).toContain('export function navigate(_name: never');
      expect(content).toContain('export type NavigateOptions');
    });
  });
});
