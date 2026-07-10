import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSharedFile } from '../src/shared-props.js';
import { createTestContext } from './support/create-test-context.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

function makeContext() {
  return createTestContext({ cwd: FIXTURES_DIR, outDir: join(FIXTURES_DIR, '.nestjs-inertia') });
}

describe('buildSharedFile — kind: function', () => {
  it('emits shared.ts with the Awaited<ReturnType<...>> reference and correct relative specifier', () => {
    const file = buildSharedFile(
      { module: './shared/share-middleware', export: 'buildSharedProps', kind: 'function' },
      makeContext(),
    );

    expect(file.path).toBe('shared.ts');
    expect(file.contents).toContain(
      'export type InertiaSharedProps = Awaited<ReturnType<(typeof import("../shared/share-middleware"))["buildSharedProps"]>>;',
    );
    expect(file.contents).toContain('Auto-generated');
  });
});

describe('buildSharedFile — kind: type', () => {
  it('emits shared.ts with the direct import(...).Export reference', () => {
    const file = buildSharedFile(
      { module: './shared/share-middleware', export: 'StaticSharedShape', kind: 'type' },
      makeContext(),
    );

    expect(file.path).toBe('shared.ts');
    expect(file.contents).toContain(
      'export type InertiaSharedProps = import("../shared/share-middleware").StaticSharedShape;',
    );
  });

  it('resolves a module path given WITH a trailing .ts extension the same way', () => {
    const file = buildSharedFile(
      { module: './shared/share-middleware.ts', export: 'StaticSharedShape', kind: 'type' },
      makeContext(),
    );

    expect(file.contents).toContain(
      'export type InertiaSharedProps = import("../shared/share-middleware").StaticSharedShape;',
    );
  });
});

describe('buildSharedFile — validation', () => {
  it('throws an actionable error when the module file does not exist', () => {
    expect(() =>
      buildSharedFile(
        { module: './shared/does-not-exist', export: 'x', kind: 'type' },
        makeContext(),
      ),
    ).toThrow(/does not exist/);
  });

  it('throws an actionable error when the named export is missing, listing available exports', () => {
    expect(() =>
      buildSharedFile(
        { module: './shared/share-middleware', export: 'nope', kind: 'function' },
        makeContext(),
      ),
    ).toThrow(/shared\.export "nope" not found.*Available exports:/s);
  });

  it('throws when the export exists but does not match the declared kind', () => {
    expect(() =>
      buildSharedFile(
        { module: './shared/share-middleware', export: 'notAFunctionOrType', kind: 'function' },
        makeContext(),
      ),
    ).toThrow(/does not look like a function export/);

    expect(() =>
      buildSharedFile(
        { module: './shared/share-middleware', export: 'buildSharedProps', kind: 'type' },
        makeContext(),
      ),
    ).toThrow(/does not look like a type\/interface export/);
  });
});
