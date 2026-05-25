import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverPages } from '../../src/discovery/pages.js';

describe('discoverPages', () => {
  const fixturesDir = resolve(__dirname, '../__fixtures__/pages-react');

  it('finds tsx pages and extracts ComponentProps source', async () => {
    const pages = await discoverPages({
      glob: '**/*.tsx',
      cwd: fixturesDir,
      propsExport: 'ComponentProps',
      componentNameStrategy: 'relative-no-ext',
    });
    const names = pages.map((p) => p.name).sort();
    expect(names).toEqual(['Dashboard', 'nopprops/Bare', 'users/Detail']);

    const dash = pages.find((p) => p.name === 'Dashboard')!;
    expect(dash.propsSource).toMatch(/user:/);
    expect(dash.propsSource).toMatch(/count: number/);

    const bare = pages.find((p) => p.name === 'nopprops/Bare')!;
    expect(bare.propsSource).toBeNull();
  });

  it('uses kebab naming strategy', async () => {
    const pages = await discoverPages({
      glob: '**/*.tsx',
      cwd: fixturesDir,
      propsExport: 'ComponentProps',
      componentNameStrategy: 'kebab',
    });
    const names = pages.map((p) => p.name).sort();
    // Dashboard → dashboard, users/Detail → users/detail
    expect(names).toContain('dashboard');
    expect(names).toContain('users/detail');
  });

  it('uses custom function naming strategy', async () => {
    const pages = await discoverPages({
      glob: '**/*.tsx',
      cwd: fixturesDir,
      propsExport: 'ComponentProps',
      componentNameStrategy: (rel) => `custom:${rel}`,
    });
    const names = pages.map((p) => p.name);
    expect(names.every((n) => n.startsWith('custom:'))).toBe(true);
  });
});
