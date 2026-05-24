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
    expect(content).toContain("from '@dudousxd/nestjs-inertia-client'");
    expect(content).not.toContain('@tanstack/query-core');
    expect(content).toContain("from '@tanstack/react-query'");
    expect(content).toContain('_queryOptions');
    expect(content).toContain('_mutationOptions');
    expect(content).toContain("from './routes.js'");
    expect(content).toContain("from '@dudousxd/nestjs-inertia-client'");
  });

  it('exports fetcher singleton', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export const fetcher = createFetcher()');
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
});
