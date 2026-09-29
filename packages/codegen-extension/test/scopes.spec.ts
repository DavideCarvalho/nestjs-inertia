/**
 * Several Inertia apps: each `InertiaModule.forFeature({ scope })` has its own `share`, so its
 * pages get its shared props, not forRoot's. `scopes: { <scope>: { shared } }` types them in
 * `shared.ts` (InertiaScopeSharedProps / ScopeSharedProps<S>) next to InertiaSharedProps.
 *
 * Also: what the extension adds to api.ts (navigate()) and shared.ts compile under the strict
 * flags apps turn on (noUnusedLocals, noUnusedParameters, exactOptionalPropertyTypes).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nestjsInertiaCodegen } from '../src/index.js';
import { createTestContext } from './support/create-test-context.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const ctx = () =>
  createTestContext({ cwd: FIXTURES_DIR, outDir: join(FIXTURES_DIR, '.nestjs-inertia') });

async function sharedTs(options: Parameters<typeof nestjsInertiaCodegen>[0]): Promise<string> {
  const files = await nestjsInertiaCodegen(options).emitFiles?.(ctx() as never);
  const shared = files?.find((file) => file.path === 'shared.ts');
  if (!shared) throw new Error('no shared.ts emitted');
  return shared.contents;
}

describe('scopes: per-scope shared props', () => {
  it('types each scope next to the default app', async () => {
    const contents = await sharedTs({
      shared: { module: './shared/share-middleware', export: 'buildSharedProps', kind: 'function' },
      scopes: {
        admin: {
          shared: {
            module: './shared/admin-shared-props',
            export: 'buildAdminSharedProps',
            kind: 'function',
          },
        },
        portal: {
          shared: {
            module: './shared/admin-shared-props',
            export: 'PortalSharedShape',
            kind: 'type',
          },
        },
      },
    });
    expect(contents).toContain(
      'export type InertiaSharedProps = Awaited<ReturnType<(typeof import("../shared/share-middleware"))["buildSharedProps"]>>;',
    );
    expect(contents).toContain('export interface InertiaScopeSharedProps {');
    expect(contents).toContain(
      '  admin: Awaited<ReturnType<(typeof import("../shared/admin-shared-props"))["buildAdminSharedProps"]>>;',
    );
    expect(contents).toContain(
      '  portal: import("../shared/admin-shared-props").PortalSharedShape;',
    );
    expect(contents).toContain(
      'export type ScopeSharedProps<S extends keyof InertiaScopeSharedProps> = InertiaScopeSharedProps[S];',
    );
  });

  it('emits shared.ts for scopes alone (no default-app `shared`)', async () => {
    const contents = await sharedTs({
      scopes: {
        admin: {
          shared: {
            module: './shared/admin-shared-props',
            export: 'buildAdminSharedProps',
            kind: 'function',
          },
        },
      },
    });
    expect(contents).toContain('export interface InertiaScopeSharedProps {');
    expect(contents).not.toContain('export type InertiaSharedProps');
  });

  it('validates each scope source like `shared`, naming the scope', async () => {
    await expect(
      sharedTs({
        scopes: {
          admin: {
            shared: { module: './shared/admin-shared-props', export: 'nope', kind: 'type' },
          },
        },
      }),
    ).rejects.toThrow(/scopes\.admin\.shared.*"nope" not found/s);
  });

  it('rejects the reserved "default" scope', () => {
    expect(() =>
      nestjsInertiaCodegen({
        scopes: {
          default: { shared: { module: './shared/share-middleware', export: 'x', kind: 'type' } },
        },
      }),
    ).toThrow(/"default"/);
  });
});

describe('strict compiler flags', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(FIXTURES_DIR, '.strict-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('navigate() and shared.ts compile under noUnused*/exactOptionalPropertyTypes', async () => {
    const header = nestjsInertiaCodegen().apiHeader?.({} as never);
    // A routes.ts of the shape the core emits.
    await writeFile(
      join(dir, 'routes.ts'),
      `export const ROUTES = { 'users.show': '/users/:id', 'users.list': '/users' } as const;
export type RouteName = keyof typeof ROUTES;
export type ExtractParams<T extends string> = T extends \`\${string}:\${infer P}/\${infer R}\` ? P | ExtractParams<R> : T extends \`\${string}:\${infer P}\` ? P : never;
export type RouteParams<K extends RouteName> = { [P in ExtractParams<(typeof ROUTES)[K]>]: string };
export function route<K extends RouteName>(name: K, params?: Record<string, string>): string {
  let url: string = ROUTES[name];
  for (const [k, v] of Object.entries(params ?? {})) url = url.replace(\`:\${k}\`, v);
  return url;
}
`,
    );
    await writeFile(
      join(dir, 'api.ts'),
      [
        ...(header?.imports ?? []),
        "import { route, ROUTES, type RouteName, type ExtractParams, type RouteParams } from './routes.js';",
        '',
        ...(header?.statements ?? []),
        '',
        "navigate('users.list');",
        "navigate('users.show', { params: { id: '1' }, preserveScroll: true });",
      ].join('\n'),
    );
    const files = await nestjsInertiaCodegen({
      shared: { module: './shared/share-middleware', export: 'buildSharedProps', kind: 'function' },
      scopes: {
        admin: {
          shared: {
            module: './shared/admin-shared-props',
            export: 'buildAdminSharedProps',
            kind: 'function',
          },
        },
      },
    }).emitFiles?.(createTestContext({ cwd: FIXTURES_DIR, outDir: dir }) as never);
    await mkdir(dir, { recursive: true });
    for (const file of files ?? []) await writeFile(join(dir, file.path), file.contents);
    await writeFile(
      join(dir, 'usage.ts'),
      `import type { InertiaSharedProps, ScopeSharedProps } from './shared';
export const name = (p: InertiaSharedProps): string => p.user.name;
export const canManage = (p: ScopeSharedProps<'admin'>): boolean | undefined => p.auth.can['users.manage'];
`,
    );

    const roots = ['api.ts', 'shared.ts', 'usage.ts'].map((f) => join(dir, f));
    const program = ts.createProgram(roots, {
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      noEmit: true,
      skipLibCheck: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      jsx: ts.JsxEmit.ReactJSX,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && roots.includes(d.file.fileName))
      .map(
        (d) =>
          `${d.file?.fileName.slice(dir.length)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
      );
    expect(diagnostics).toEqual([]);
  });
});
