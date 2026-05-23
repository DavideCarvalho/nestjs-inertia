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
        name: 'users.list',
        method: 'GET',
        path: '/api/users',
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
        name: 'users.create',
        method: 'POST',
        path: '/api/users',
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
    expect(content).toContain("from '@tanstack/query-core'");
    expect(content).toContain("from './routes.js'");
    expect(content).toContain("from '@dudousxd/nestjs-inertia-client'");
  });

  it('exports fetcher singleton', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export const fetcher = createFetcher()');
  });

  it('exports ApiRouter type with only contracted routes', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export type ApiRouter');
    expect(content).toContain('"users.list"');
    expect(content).toContain('"users.create"');
    // Non-contracted route must not appear in ApiRouter
    expect(content).not.toContain('"HealthController.check"');
  });

  it('GET contract produces queryOptions', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('queryOptions');
    expect(content).toContain('queryKey: ["users.list"');
    expect(content).toContain('fetcher.get<');
  });

  it('POST contract produces mutationOptions', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('mutationOptions');
    expect(content).toContain('mutationFn');
    expect(content).toContain('fetcher.post<');
  });

  it('ApiRouter GET entry has body: never', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // GET routes must declare body as never — find the users.list entry line
    const listLine = content
      .split('\n')
      .find((l) => l.includes('"users.list"') && l.includes('method:'));
    expect(listLine).toBeDefined();
    expect(listLine).toMatch(/body:\s*never/);
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
    // find the users.create entry line in ApiRouter
    const createLine = content
      .split('\n')
      .find((l) => l.includes('"users.create"') && l.includes('method:'));
    expect(createLine).toBeDefined();
    expect(createLine).toMatch(/query:\s*never/);
  });

  it('exports InferResponse, InferBody, InferQuery mapped types', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export type InferResponse');
    expect(content).toContain('export type InferBody');
    expect(content).toContain('export type InferQuery');
  });

  it('skips routes without contract', async () => {
    const onlyNoContract: RouteDescriptor[] = [
      { method: 'GET', path: '/health', name: 'HealthController.check', params: [] },
    ];
    await emitApi(onlyNoContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    // ApiRouter should be empty / only contracts
    expect(content).not.toContain('"HealthController.check"');
  });

  it('creates outDir if it does not exist', async () => {
    const nested = join(outDir, 'nested', 'dir');
    await emitApi(routesWithContract, nested);
    const content = await readFile(join(nested, 'api.ts'), 'utf8');
    expect(content).toContain('ApiRouter');
  });

  it('exported api object contains both entries', async () => {
    await emitApi(routesWithContract, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');
    expect(content).toContain('export const api');
    expect(content).toContain('"users.list"');
    expect(content).toContain('"users.create"');
  });

  it('sanitizes route names with unsafe chars using JSON.stringify', async () => {
    const unsafeName = "na'me\nwith\nnewlines";
    const maliciousRoutes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/safe',
        name: unsafeName,
        params: [],
        contract: {
          name: unsafeName,
          method: 'GET',
          path: '/safe',
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await emitApi(maliciousRoutes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');

    // The newlines must be escaped (\\n) — raw newlines would break the generated file
    expect(content).not.toMatch(/na'me\n/);
    // The name should appear JSON-encoded (double-quoted with escape sequences)
    expect(content).toContain(JSON.stringify(unsafeName));
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
          name: 'safe.name',
          method: 'GET',
          path: unsafePath,
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    await emitApi(maliciousRoutes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');

    // The path must appear JSON-encoded, not as a raw template literal
    expect(content).toContain(JSON.stringify(unsafePath));
  });
});
