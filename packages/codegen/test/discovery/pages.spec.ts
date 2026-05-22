import { describe, it, expect } from 'vitest';
import { discoverPages } from '../../src/discovery/pages.js';
import { resolve } from 'node:path';

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
});
