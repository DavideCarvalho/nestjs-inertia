import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * End-to-end integration test: pages + routes + api emission together.
 *
 * Uses:
 * - The existing `pages-react` fixture for page discovery (Dashboard.tsx, users/Detail.tsx)
 * - The existing `app` fixture module for route discovery (UsersController + ContractUsersController)
 *
 * Asserts that a single `generate()` call with pre-discovered routes produces all four artifacts:
 *   pages.d.ts   — contains page names from pages-react
 *   routes.ts    — contains route names from both controllers
 *   api.ts       — contains the 'users.list' contract block with queryOptions
 *   index.d.ts   — barrel re-exports all three (plus api.ts because contracts exist)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '../../src/config/types.js';
import { discoverRoutes } from '../../src/discovery/routes.js';
import { generate } from '../../src/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../__fixtures__');
const PAGES_REACT_DIR = resolve(FIXTURES_DIR, 'pages-react');
const APP_MODULE = resolve(FIXTURES_DIR, 'app/app.module.ts');

describe('end-to-end: pages + routes + api', () => {
  let outDir: string;
  let pagesContent: string;
  let routesContent: string;
  let apiContent: string;
  let indexContent: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'codegen-e2e-'));

    // 1. Discover routes from the fixture AppModule (includes ContractUsersController)
    const routes = await discoverRoutes({ moduleEntry: APP_MODULE });

    // 2. Build a ResolvedConfig pointing at the pages-react fixture
    const config: ResolvedConfig = {
      pages: {
        glob: '**/*.tsx',
        propsExport: 'ComponentProps',
        componentNameStrategy: 'relative-no-ext',
      },
      scopes: {},
      codegen: {
        outDir,
        cwd: PAGES_REACT_DIR,
      },
      app: {
        moduleEntry: APP_MODULE,
        tsconfig: null,
      },
    };

    // 3. Run the full generate pass
    await generate(config, routes);

    // 4. Read all artifacts
    pagesContent = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    routesContent = await readFile(join(outDir, 'routes.ts'), 'utf8');
    apiContent = await readFile(join(outDir, 'api.ts'), 'utf8');
    indexContent = await readFile(join(outDir, 'index.d.ts'), 'utf8');
  }, 30_000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  // --- pages.d.ts ---
  it('pages.d.ts contains Dashboard page', () => {
    expect(pagesContent).toContain('Dashboard');
  });

  it('pages.d.ts is a valid InertiaPages interface', () => {
    expect(pagesContent).toContain('export interface InertiaPages');
  });

  // --- routes.ts ---
  it('routes.ts contains UsersController routes', () => {
    expect(routesContent).toContain('UsersController.list');
    expect(routesContent).toContain('UsersController.show');
  });

  it('routes.ts contains ContractUsersController.list route', () => {
    expect(routesContent).toContain('ContractUsersController.list');
  });

  it('routes.ts exports the route() helper', () => {
    expect(routesContent).toContain('export function route');
  });

  it('routes.ts exports RouteName type', () => {
    expect(routesContent).toContain('export type RouteName');
  });

  // --- api.ts ---
  it('api.ts exists and contains the users.list block', () => {
    expect(apiContent).toContain("'users.list'");
  });

  it('api.ts GET contract has queryOptions', () => {
    expect(apiContent).toContain('queryOptions');
    expect(apiContent).toContain("queryKey: ['users.list'");
  });

  it('api.ts imports from @tanstack/query-core and @dudousxd/nestjs-inertia-client', () => {
    expect(apiContent).toContain("from '@tanstack/query-core'");
    expect(apiContent).toContain("from '@dudousxd/nestjs-inertia-client'");
  });

  it('api.ts exports ApiRouter type with users.list entry', () => {
    expect(apiContent).toContain('export type ApiRouter');
    expect(apiContent).toContain("'users.list'");
    // body should be never for a GET
    const listTypeLine = apiContent
      .split('\n')
      .find((l) => l.includes("'users.list'") && l.includes('method:'));
    expect(listTypeLine).toBeDefined();
    expect(listTypeLine).toMatch(/body:\s*never/);
  });

  it('api.ts query type contains active field', () => {
    // The users.list contract has query: z.object({ active: z.boolean().optional() })
    expect(apiContent).toContain('active');
  });

  it('api.ts response type contains id and name fields', () => {
    expect(apiContent).toContain('id');
    expect(apiContent).toContain('name');
  });

  it('api.ts exports InferResponse, InferBody, InferQuery helpers', () => {
    expect(apiContent).toContain('export type InferResponse');
    expect(apiContent).toContain('export type InferBody');
    expect(apiContent).toContain('export type InferQuery');
  });

  // --- index.d.ts ---
  it('index.d.ts re-exports pages', () => {
    expect(indexContent).toContain("from './pages.js'");
  });

  it('index.d.ts re-exports routes', () => {
    expect(indexContent).toContain("from './routes.js'");
  });

  it('index.d.ts re-exports api (because contracts are present)', () => {
    expect(indexContent).toContain("from './api.js'");
  });
}, 30_000); // outer suite timeout
