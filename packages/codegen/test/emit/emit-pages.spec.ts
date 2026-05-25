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
    expect(content).toContain('"users/Detail": { userId: string }');
  });

  it('uses unknown for pages without propsSource', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('"nopprops/Bare": unknown');
  });

  it('quotes page names that contain slashes (using JSON.stringify)', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('"users/Detail"');
    expect(content).toContain('"nopprops/Bare"');
  });

  it('creates outDir if it does not exist', async () => {
    const nestedOut = join(outDir, 'nested', '.nestjs-inertia');
    await emitPages(pages, nestedOut);
    const content = await readFile(join(nestedOut, 'pages.d.ts'), 'utf8');
    expect(content).toContain('InertiaPages');
  });

  describe('InertiaPageName union type', () => {
    it('emits InertiaPageName union with all page names', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('export type InertiaPageName =');
      expect(content).toContain('"Dashboard"');
      expect(content).toContain('"users/Detail"');
      expect(content).toContain('"nopprops/Bare"');
    });

    it('emits InertiaPageName as never when no pages exist', async () => {
      await emitPages([], outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('export type InertiaPageName = never;');
    });
  });

  describe('module augmentation for @dudousxd/nestjs-inertia', () => {
    it('emits declare module augmentation block', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain("declare module '@dudousxd/nestjs-inertia'");
    });

    it('augments InertiaPages with all discovered page names mapped to true', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('Dashboard: true;');
      expect(content).toContain('"users/Detail": true;');
      expect(content).toContain('"nopprops/Bare": true;');
    });

    it('augmentation contains interface InertiaPages inside declare module', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      // Verify the structure: declare module wrapping interface InertiaPages
      const moduleBlock = content.slice(content.indexOf("declare module '@dudousxd/nestjs-inertia'"));
      expect(moduleBlock).toContain('interface InertiaPages {');
    });
  });

  // L-3: JSON.stringify properly escapes unsafe characters in component names
  describe('L-3: JSON.stringify escaping', () => {
    it('escapes backslashes in page names', async () => {
      const p: DiscoveredPage[] = [
        { name: 'foo\\bar', absolutePath: '/x.tsx', relativePath: 'x.tsx', propsSource: null },
      ];
      await emitPages(p, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      // JSON.stringify('foo\\bar') = '"foo\\\\bar"'
      expect(content).toContain('"foo\\\\bar"');
    });

    it('escapes double quotes in page names', async () => {
      const p: DiscoveredPage[] = [
        { name: 'foo"bar', absolutePath: '/x.tsx', relativePath: 'x.tsx', propsSource: null },
      ];
      await emitPages(p, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('"foo\\"bar"');
    });

    it('simple identifier names are not quoted in interface keys', async () => {
      const p: DiscoveredPage[] = [
        { name: 'Dashboard', absolutePath: '/x.tsx', relativePath: 'x.tsx', propsSource: null },
      ];
      await emitPages(p, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('  Dashboard: unknown;');
      // The key should be unquoted in both the props interface and the augmentation interface
      expect(content).toContain('  Dashboard: true;');
      // But it IS quoted in the InertiaPageName union (JSON.stringify always quotes)
      expect(content).toContain('"Dashboard"');
    });
  });
});
