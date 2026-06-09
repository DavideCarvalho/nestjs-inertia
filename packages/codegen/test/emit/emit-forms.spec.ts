import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RouteDescriptor } from '../../src/discovery/types.js';
import { emitForms } from '../../src/emit/emit-forms.js';

describe('emitForms', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'codegen-emit-forms-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  async function read(): Promise<string> {
    return readFile(join(outDir, 'forms.ts'), 'utf8');
  }

  it('inlines body zod text and emits the formSchemas map (inline contract)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/auth/login',
        name: 'auth.login',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{ email: string; password: string }',
            response: 'unknown',
            bodyZodText: 'z.object({ email: z.string().email(), password: z.string().min(8) })',
          },
        },
      },
    ];
    const wrote = await emitForms(routes, outDir);
    expect(wrote).toBe(true);

    const out = await read();
    expect(out).toContain("import { z } from 'zod';");
    expect(out).toContain(
      'export const LoginBodySchema = z.object({ email: z.string().email(), password: z.string().min(8) });',
    );
    expect(out).toContain('export type LoginBody = z.infer<typeof LoginBodySchema>;');
    expect(out).toContain('"auth.login": LoginBodySchema,');
    expect(out).toContain('export const formSchemas = {');
  });

  it('re-exports a named contract const member (Path A ref)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/auth/login',
        name: 'auth.login',
        params: [],
        controllerRef: {
          className: 'AuthController',
          methodName: 'login',
          filePath: join(outDir, 'auth.controller.ts'),
        },
        contract: {
          contractSource: {
            query: null,
            body: '{ email: string }',
            response: 'unknown',
            bodyZodRef: {
              name: 'loginContract.body',
              filePath: join(outDir, 'auth.controller.ts'),
            },
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out).toContain("import { loginContract } from './auth.controller';");
    expect(out).toContain('export const LoginBodySchema = loginContract.body;');
  });

  it('emits a QuerySchema for GET query-only routes', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/users',
        name: 'users.list',
        params: [],
        contract: {
          contractSource: {
            query: '{ page?: number }',
            body: null,
            response: 'unknown',
            queryZodText: 'z.object({ page: z.coerce.number().optional() })',
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out).toContain(
      'export const ListQuerySchema = z.object({ page: z.coerce.number().optional() });',
    );
    expect(out).toContain('export type ListQuery = z.infer<typeof ListQuerySchema>;');
    // No body → not in the formSchemas map.
    expect(out).not.toContain('ListBodySchema');
  });

  it('aliases base names on method-segment collision (AuthLogin vs AdminLogin)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/auth/login',
        name: 'auth.login',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{ a: string }',
            response: 'unknown',
            bodyZodText: 'z.object({ a: z.string() })',
          },
        },
      },
      {
        method: 'POST',
        path: '/admin/login',
        name: 'admin.login',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{ b: string }',
            response: 'unknown',
            bodyZodText: 'z.object({ b: z.string() })',
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out).toContain('export const AdminLoginBodySchema =');
    expect(out).toContain('export const AuthLoginBodySchema =');
    expect(out).not.toContain('export const LoginBodySchema =');
  });

  it('returns false (no file) when no validatable bodies exist', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'GET',
        path: '/health',
        name: 'health.check',
        params: [],
        contract: {
          contractSource: { query: null, body: null, response: 'unknown' },
        },
      },
    ];
    const wrote = await emitForms(routes, outDir);
    expect(wrote).toBe(false);
  });

  it('returns false when forms.enabled === false', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/auth/login',
        name: 'auth.login',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{ a: string }',
            response: 'unknown',
            bodyZodText: 'z.object({ a: z.string() })',
          },
        },
      },
    ];
    const wrote = await emitForms(routes, outDir, {
      enabled: false,
      watch: 'src/**/*.dto.ts',
      zodImport: 'zod',
    });
    expect(wrote).toBe(false);
  });

  it('hoists nested schemas (Path B) above the parent export', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/account/register',
        name: 'account.register',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ address: AddressDtoSchema })',
            formNestedSchemas: { AddressDtoSchema: 'z.object({ city: z.string() })' },
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out).toContain('const AddressDtoSchema = z.object({ city: z.string() });');
    expect(out).toContain(
      'export const RegisterBodySchema = z.object({ address: AddressDtoSchema });',
    );
    expect(out.indexOf('const AddressDtoSchema =')).toBeLessThan(
      out.indexOf('export const RegisterBodySchema ='),
    );
  });

  it('surfaces form warnings as header comments', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/auth/login',
        name: 'auth.login',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ password: z.string() })',
            formWarnings: ['@IsStrongPassword is not translatable to zod and was skipped.'],
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out).toContain('// warning: @IsStrongPassword is not translatable');
  });

  // Count occurrences of a `const <name> =` declaration (whole-word).
  function countConstDecl(out: string, name: string): number {
    const re = new RegExp(`(^|\\n)\\s*const ${name} =`, 'g');
    return (out.match(re) ?? []).length;
  }

  it('hoists a nested DTO shared by two endpoints EXACTLY once (no redeclaration)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/a',
        name: 'a.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ filter: ColumnFilterSchema })',
            formNestedSchemas: { ColumnFilterSchema: 'z.object({ field: z.string() })' },
          },
        },
      },
      {
        method: 'POST',
        path: '/b',
        name: 'b.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ filter: ColumnFilterSchema })',
            // Same name, IDENTICAL shape → must be deduped to one declaration.
            formNestedSchemas: { ColumnFilterSchema: 'z.object({ field: z.string() })' },
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    // The shared schema is declared once and referenced from both endpoints.
    expect(countConstDecl(out, 'ColumnFilterSchema')).toBe(1);
    expect(out).toContain(
      'export const ACreateBodySchema = z.object({ filter: ColumnFilterSchema });',
    );
    expect(out).toContain(
      'export const BCreateBodySchema = z.object({ filter: ColumnFilterSchema });',
    );
  });

  it('degrades a recursive nested schema to z.unknown() (no implicit-any / no unannotated self-ref)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/q',
        name: 'q.execute',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ where: z.array(ColumnFilterSchema) })',
            formNestedSchemas: {
              // Self-referential text — would be `const X = z.lazy(() => ... X ...)`
              // (implicit any) if emitted verbatim.
              ColumnFilterSchema:
                'z.object({ field: z.string().optional(), OR: z.array(z.lazy(() => ColumnFilterSchema)).optional() })',
            },
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    // Degraded to a valid placeholder.
    expect(out).toContain(
      'const ColumnFilterSchema = z.unknown() /* recursive type — not expanded */;',
    );
    // Crucially: no unannotated self-referential `z.lazy` declaration remains.
    expect(out).not.toMatch(/const ColumnFilterSchema = z\.object\([^;]*ColumnFilterSchema/);
    expect(out).not.toMatch(/const ColumnFilterSchema = z\.lazy/);
  });

  it('disambiguates same-name-DIFFERENT-shape nested schemas (no wrong collision)', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/a',
        name: 'a.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ filter: ColumnFilterSchema })',
            formNestedSchemas: { ColumnFilterSchema: 'z.object({ field: z.string() })' },
          },
        },
      },
      {
        method: 'POST',
        path: '/b',
        name: 'b.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({ filter: ColumnFilterSchema })',
            // Same NAME, DIFFERENT shape → must NOT collapse into the first one.
            formNestedSchemas: {
              ColumnFilterSchema: 'z.object({ operator: z.string(), value: z.number() })',
            },
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    // Both distinct shapes survive under distinct names.
    expect(out).toContain('const ColumnFilterSchema = z.object({ field: z.string() });');
    expect(out).toContain(
      'const ColumnFilterSchema_2 = z.object({ operator: z.string(), value: z.number() });',
    );
    // The second endpoint references the disambiguated name, not the first shape.
    expect(out).toContain(
      'export const ACreateBodySchema = z.object({ filter: ColumnFilterSchema });',
    );
    expect(out).toContain(
      'export const BCreateBodySchema = z.object({ filter: ColumnFilterSchema_2 });',
    );
    // No exact-name redeclaration.
    expect(countConstDecl(out, 'ColumnFilterSchema')).toBe(1);
    expect(countConstDecl(out, 'ColumnFilterSchema_2')).toBe(1);
  });

  it('orders routes deterministically by name', async () => {
    const routes: RouteDescriptor[] = [
      {
        method: 'POST',
        path: '/z',
        name: 'z.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({})',
          },
        },
      },
      {
        method: 'POST',
        path: '/a',
        name: 'a.create',
        params: [],
        contract: {
          contractSource: {
            query: null,
            body: '{}',
            response: 'unknown',
            bodyZodText: 'z.object({})',
          },
        },
      },
    ];
    await emitForms(routes, outDir);
    const out = await read();
    expect(out.indexOf('// a.create')).toBeLessThan(out.indexOf('// z.create'));
  });
});
