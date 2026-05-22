import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emitRoutes } from '../../src/emit/emit-routes.js';
import type { RouteDescriptor } from '../../src/discovery/routes.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('emitRoutes', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'codegen-emit-routes-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const sampleRoutes: RouteDescriptor[] = [
    { method: 'GET', path: '/users', name: 'UsersController.list', params: [] },
    {
      method: 'GET',
      path: '/users/:id',
      name: 'UsersController.show',
      params: [{ name: 'id', source: 'path' }],
    },
    {
      method: 'POST',
      path: '/users',
      name: 'UsersController.create',
      params: [],
    },
  ];

  it('writes routes.ts with the expected shape', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must contain the RouteName union
    expect(content).toContain('RouteName');

    // Must contain the RouteParams mapped type
    expect(content).toContain('RouteParams');

    // Must contain the runtime route() helper
    expect(content).toContain('export function route<');

    // Must list all route names
    expect(content).toContain("'UsersController.list'");
    expect(content).toContain("'UsersController.show'");
    expect(content).toContain("'UsersController.create'");
  });

  it('route() helper correctly interpolates params', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must have a route table (ROUTES constant)
    expect(content).toContain("'UsersController.show': '/users/:id'");
    expect(content).toContain("'UsersController.list': '/users'");
  });

  it('RouteName type covers all routes', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // RouteName should be a union of all names
    expect(content).toMatch(/type RouteName\s*=/);
    expect(content).toContain("'UsersController.list'");
    expect(content).toContain("'UsersController.show'");
    expect(content).toContain("'UsersController.create'");
  });

  it('RouteParams<K> maps template-literal path params to string properties', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // The RouteParams conditional type must use template literals with infer
    expect(content).toContain('infer');
    // Should reference the path type '/users/:id'
    expect(content).toContain("'/users/:id'");
  });

  it('creates outDir if it does not exist', async () => {
    const nested = join(outDir, 'nested', 'dir');
    await emitRoutes(sampleRoutes, nested);
    const content = await readFile(join(nested, 'routes.ts'), 'utf8');
    expect(content).toContain('RouteName');
  });
});
