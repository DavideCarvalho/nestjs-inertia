import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveredPage } from '../../src/discovery/pages.js';
import { emitPages } from '../../src/emit/emit-pages.js';

describe('emitPages', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'emit-pages-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const pages: DiscoveredPage[] = [
    {
      name: 'Dashboard',
      absolutePath: '/fake/Dashboard.tsx',
      relativePath: 'Dashboard.tsx',
      propsSource: '{ user: { id: number; name: string }; count: number }',
    },
    {
      name: 'users/Detail',
      absolutePath: '/fake/users/Detail.tsx',
      relativePath: 'users/Detail.tsx',
      propsSource: '{ userId: string }',
    },
    {
      name: 'nopprops/Bare',
      absolutePath: '/fake/nopprops/Bare.tsx',
      relativePath: 'nopprops/Bare.tsx',
      propsSource: null,
    },
  ];

  it('writes pages.d.ts to outDir', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('export interface InertiaPages {');
  });

  it('maps each page name to its props source', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('Dashboard: { user: { id: number; name: string }; count: number }');
    expect(content).toContain("'users/Detail': { userId: string }");
  });

  it('uses unknown for pages without propsSource', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain("'nopprops/Bare': unknown");
  });

  it('quotes page names that contain slashes', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain("'users/Detail'");
    expect(content).toContain("'nopprops/Bare'");
  });

  it('creates outDir if it does not exist', async () => {
    const nestedOut = join(outDir, 'nested', '.nestjs-inertia');
    await emitPages(pages, nestedOut);
    const content = await readFile(join(nestedOut, 'pages.d.ts'), 'utf8');
    expect(content).toContain('InertiaPages');
  });
});
