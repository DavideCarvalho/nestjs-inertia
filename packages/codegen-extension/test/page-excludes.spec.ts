import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPageExcludesFile } from '../src/page-excludes.js';
import { createTestContext } from './support/create-test-context.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('buildPageExcludesFile', () => {
  it('discovers @Inertia page routes, resolves paths, sorts by path, and skips the decoy import', () => {
    const ctx = createTestContext({
      cwd: FIXTURES_DIR,
      outDir: join(FIXTURES_DIR, '.nestjs-inertia'),
      contractsGlob: 'controllers/**/*.controller.ts',
    });

    const file = buildPageExcludesFile(ctx);

    expect(file.path).toBe('page-excludes.ts');
    expect(file.contents).toContain('export const inertiaPageExcludes = [');
    expect(file.contents).toContain('as const;');
    // The decoy controller's same-named `Inertia` decorator is imported from an unrelated
    // module and must not be picked up.
    expect(file.contents).not.toContain('NotARealPage');
    expect(file.contents).not.toContain('/decoy');

    // Nest-style path params are kept as-is; entries are sorted by path.
    const expectedOrder = [
      '{ path: "/accounts", method: "GET" }',
      '{ path: "/accounts/:id/edit", method: "GET" }',
      '{ path: "/chat/:threadId", method: "GET" }',
      '{ path: "/dashboard", method: "GET" }',
    ];
    let previousIndex = -1;
    for (const entry of expectedOrder) {
      const index = file.contents.indexOf(entry);
      expect(index, `expected to find entry: ${entry}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    // The bare @Get(':id') with no @Inertia must not be excluded.
    expect(file.contents).not.toContain('{ path: "/accounts/:id", method: "GET" }');
  });

  it('throws when the contracts glob matches zero @Inertia page routes', () => {
    const ctx = createTestContext({
      cwd: FIXTURES_DIR,
      outDir: join(FIXTURES_DIR, '.nestjs-inertia'),
      contractsGlob: 'controllers-empty/**/*.controller.ts',
    });

    expect(() => buildPageExcludesFile(ctx)).toThrow(/no @Inertia page routes were found/);
  });
});
