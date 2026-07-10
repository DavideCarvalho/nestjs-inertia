import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nestjsInertiaCodegen } from '../src/index.js';
import { createTestContext } from './support/create-test-context.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('nestjsInertiaCodegen', () => {
  it('is a named extension exposing apiHeader', () => {
    const ext = nestjsInertiaCodegen();
    expect(ext.name).toBe('nestjs-inertia');
    expect(typeof ext.apiHeader).toBe('function');
  });

  it('apiHeader imports the Inertia router + emits NavigateOptions and navigate()', () => {
    const header = nestjsInertiaCodegen().apiHeader?.({} as never);
    expect(header?.imports).toEqual(["import { router } from '@inertiajs/react';"]);
    expect(header?.statements?.[0]).toContain('export type NavigateOptions');
    expect(header?.statements?.[1]).toContain('export function navigate<K extends RouteName>');
    expect(header?.statements?.[1]).toContain('router.visit(url, visitOptions)');
  });

  it('zero-arg call emits no files — behavior unchanged from before the options object existed', () => {
    const ext = nestjsInertiaCodegen();
    expect(ext.emitFiles).toBeUndefined();
  });

  it('does not wire emitFiles when both options are explicitly falsy', () => {
    const ext = nestjsInertiaCodegen({ pageExcludes: false });
    expect(ext.emitFiles).toBeUndefined();
  });

  it('wires emitFiles to return only the shared.ts file when just `shared` is set', async () => {
    const ext = nestjsInertiaCodegen({
      shared: { module: './shared/share-middleware', export: 'StaticSharedShape', kind: 'type' },
    });
    const ctx = createTestContext({
      cwd: FIXTURES_DIR,
      outDir: join(FIXTURES_DIR, '.nestjs-inertia'),
    });
    // `ext.emitFiles` is typed against the host's full `ExtensionContext`; our stub only
    // implements the narrower `EmitContext` the implementation actually reads (see
    // src/emit-context.ts). Bridged with `as never`, matching the existing convention above.
    const files = await ext.emitFiles?.(ctx as never);
    expect(files?.map((file) => file.path)).toEqual(['shared.ts']);
  });

  it('wires emitFiles to return both files when `shared` and `pageExcludes` are set', async () => {
    const ext = nestjsInertiaCodegen({
      shared: { module: './shared/share-middleware', export: 'StaticSharedShape', kind: 'type' },
      pageExcludes: true,
    });
    const ctx = createTestContext({
      cwd: FIXTURES_DIR,
      outDir: join(FIXTURES_DIR, '.nestjs-inertia'),
      contractsGlob: 'controllers/**/*.controller.ts',
    });
    const files = await ext.emitFiles?.(ctx as never);
    expect(files?.map((file) => file.path).sort()).toEqual(['page-excludes.ts', 'shared.ts']);
  });
});
