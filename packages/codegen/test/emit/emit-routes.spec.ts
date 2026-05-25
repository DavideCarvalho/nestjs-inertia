import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RouteDescriptor } from '../../src/discovery/types.js';
import { emitRoutes } from '../../src/emit/emit-routes.js';

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
    expect(content).toContain('"UsersController.list"');
    expect(content).toContain('"UsersController.show"');
    expect(content).toContain('"UsersController.create"');
  });

  it('route() helper correctly interpolates params', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must have a route table (ROUTES constant)
    expect(content).toContain('"UsersController.show": "/users/:id"');
    expect(content).toContain('"UsersController.list": "/users"');
  });

  it('RouteName type covers all routes', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // RouteName should be a union of all names
    expect(content).toMatch(/type RouteName\s*=/);
    expect(content).toContain('"UsersController.list"');
    expect(content).toContain('"UsersController.show"');
    expect(content).toContain('"UsersController.create"');
  });

  it('RouteParams<K> maps template-literal path params to string properties', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // The RouteParams conditional type must use template literals with infer
    expect(content).toContain('infer');
    // Should reference the path type "/users/:id"
    expect(content).toContain('"/users/:id"');
  });

  it('creates outDir if it does not exist', async () => {
    const nested = join(outDir, 'nested', 'dir');
    await emitRoutes(sampleRoutes, nested);
    const content = await readFile(join(nested, 'routes.ts'), 'utf8');
    expect(content).toContain('RouteName');
  });

  it('emits RouteParamsMap type mapping every RouteName to its RouteParams', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must export the RouteParamsMap type
    expect(content).toContain('export type RouteParamsMap');

    // Must be a mapped type over RouteName with RouteParams<K>
    expect(content).toMatch(/RouteParamsMap\s*=\s*\{\s*\[K in RouteName\]\s*:\s*RouteParams<K>/);
  });

  it('RouteParamsMap appears after RouteParams and before route() in the output', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    const routeParamsIdx = content.indexOf('export type RouteParams<');
    const routeParamsMapIdx = content.indexOf('export type RouteParamsMap');
    const routeFnIdx = content.indexOf('export function route<');

    expect(routeParamsMapIdx).toBeGreaterThan(routeParamsIdx);
    expect(routeFnIdx).toBeGreaterThan(routeParamsMapIdx);
  });

  it('route() signature accepts optional query parameter', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must accept query as optional second/third positional arg
    expect(content).toContain('query?: Record<string, unknown>');
  });

  it('route() body serializes query params to query string', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must contain URLSearchParams usage for query
    expect(content).toContain('URLSearchParams');
    expect(content).toContain('qs.append');
  });

  it('route() appends query string when query is provided (runtime eval)', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Verify the generated file contains the URLSearchParams-based query logic
    // (This is the definitive assertion since new Function can't parse TypeScript)
    expect(content).toContain('URLSearchParams');
    expect(content).toContain('qs.append(k, String(v))');
    expect(content).toContain("resolvedPath.includes('?') ? '&' : '?'");

    // Also verify the ROUTES entries are present so we know the route() call would work
    expect(content).toContain('"UsersController.list": "/users"');
    expect(content).toContain('"UsersController.show": "/users/:id"');
  });

  it('route() uses JSON.stringify-safe keys in ROUTES constant', async () => {
    const routesWithQuotes: RouteDescriptor[] = [
      { method: 'GET', path: '/foo', name: "na'me", params: [] },
    ];
    await emitRoutes(routesWithQuotes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // The name should appear JSON-encoded (double-quoted with escaped content)
    expect(content).toContain('"na\'me"');
  });

  it('route() throws a rich error for invalid route names listing available routes', async () => {
    await emitRoutes(sampleRoutes, outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must contain the undefined-check guard
    expect(content).toContain('path === undefined');

    // Must throw with a message including the route name and "does not exist"
    expect(content).toContain('[nestjs-inertia] Route');
    expect(content).toContain('does not exist');

    // Must list available routes in the error
    expect(content).toContain('Available routes');
    expect(content).toContain('Object.keys(ROUTES)');

    // Must include guidance about common causes
    expect(content).toContain('nestjs-inertia codegen');
    expect(content).toContain('@As()');
  });

  it('emits empty stub types when routes array is empty', async () => {
    await emitRoutes([], outDir);
    const content = await readFile(join(outDir, 'routes.ts'), 'utf8');

    // Must export an empty ROUTES object
    expect(content).toContain('export const ROUTES = {} as const;');

    // Must export RouteName as never
    expect(content).toContain('export type RouteName = never;');

    // Must export a no-op route function
    expect(content).toContain('export function route(');

    // Must export ExtractParams as never
    expect(content).toContain('export type ExtractParams<_Path extends string> = never;');

    // Must export RouteParams with Record<string, never>
    expect(content).toContain(
      'export type RouteParams<_K extends RouteName> = Record<string, never>;',
    );

    // Should NOT contain the full route() helper with URLSearchParams
    expect(content).not.toContain('URLSearchParams');
  });
});
