import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveredPage } from '../../src/discovery/pages.js';
import type { SharedPropsResult } from '../../src/discovery/shared-props.js';
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

  function expectedImportPath(absolutePath: string): string {
    let rel = relative(outDir, absolutePath).replace(/\.(tsx?|vue|svelte)$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
  }

  it('writes pages.d.ts to outDir', async () => {
    await emitPages(pages, outDir);
    const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
    expect(content).toContain('InertiaPageName');
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

    it('augments pages with Parameters<typeof import(...).default>[0]', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      const dashboardImport = expectedImportPath('/fake/Dashboard.tsx');
      const detailImport = expectedImportPath('/fake/users/Detail.tsx');
      expect(content).toContain(
        `Dashboard: Parameters<typeof import('${dashboardImport}').default>[0];`,
      );
      expect(content).toContain(
        `"users/Detail": Parameters<typeof import('${detailImport}').default>[0];`,
      );
    });

    it('augments all pages including those without propsSource', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      const bareImport = expectedImportPath('/fake/nopprops/Bare.tsx');
      expect(content).toContain(
        `"nopprops/Bare": Parameters<typeof import('${bareImport}').default>[0];`,
      );
    });

    it('augmentation contains interface InertiaPages inside declare module', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      const moduleBlock = content.slice(
        content.indexOf("declare module '@dudousxd/nestjs-inertia'"),
      );
      expect(moduleBlock).toContain('interface InertiaPages {');
    });
  });

  describe('InertiaProps helper type', () => {
    it('emits InertiaProps type alias', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('export type InertiaProps<K extends InertiaPageName>');
    });

    it('InertiaProps resolves to InertiaPages[K]', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain(
        "export type InertiaProps<K extends InertiaPageName> = import('@dudousxd/nestjs-inertia').InertiaPages[K];",
      );
    });
  });

  describe('L-3: JSON.stringify escaping', () => {
    it('escapes backslashes in page names', async () => {
      const p: DiscoveredPage[] = [
        { name: 'foo\\bar', absolutePath: '/x.tsx', relativePath: 'x.tsx', propsSource: null },
      ];
      await emitPages(p, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
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

    it('simple identifier names are not quoted in augmentation keys', async () => {
      const p: DiscoveredPage[] = [
        { name: 'Dashboard', absolutePath: '/x.tsx', relativePath: 'x.tsx', propsSource: null },
      ];
      await emitPages(p, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      const importPath = expectedImportPath('/x.tsx');
      expect(content).toContain(
        `Dashboard: Parameters<typeof import('${importPath}').default>[0];`,
      );
      expect(content).toContain('"Dashboard"');
    });
  });

  describe('InertiaSharedProps augmentation', () => {
    it('does not emit InertiaSharedProps when sharedProps is null', async () => {
      await emitPages(pages, outDir, { sharedProps: null });
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).not.toContain('InertiaSharedProps');
    });

    it('does not emit InertiaSharedProps when sharedProps option is omitted', async () => {
      await emitPages(pages, outDir);
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).not.toContain('InertiaSharedProps');
    });

    it('emits InertiaSharedProps interface with properties', async () => {
      const sharedProps: SharedPropsResult = {
        typeString: '{ auth: { id: string; name: string } | null; flash: Record<string, string> }',
        properties: [
          { name: 'auth', type: '{ id: string; name: string } | null' },
          { name: 'flash', type: 'Record<string, string>' },
        ],
        isImportRef: false,
      };
      await emitPages(pages, outDir, { sharedProps });
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');

      expect(content).toContain('interface InertiaSharedProps {');
      expect(content).toContain('auth: { id: string; name: string } | null;');
      expect(content).toContain('flash: Record<string, string>;');
    });

    it('InertiaSharedProps is inside the declare module block', async () => {
      const sharedProps: SharedPropsResult = {
        typeString: '{ locale: string }',
        properties: [{ name: 'locale', type: 'string' }],
        isImportRef: false,
      };
      await emitPages(pages, outDir, { sharedProps });
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      const moduleBlock = content.slice(
        content.indexOf("declare module '@dudousxd/nestjs-inertia'"),
      );
      expect(moduleBlock).toContain('interface InertiaSharedProps {');
      expect(moduleBlock).toContain('locale: string;');
    });

    it('does not emit InertiaSharedProps when properties is null (isImportRef case emits extends)', async () => {
      const sharedProps: SharedPropsResult = {
        typeString: "Awaited<ReturnType<typeof import('./shared').getSharedProps>>",
        properties: null,
        isImportRef: true,
      };
      await emitPages(pages, outDir, { sharedProps });
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('interface InertiaSharedProps extends');
      expect(content).toContain("Awaited<ReturnType<typeof import('./shared').getSharedProps>>");
    });

    it('still emits InertiaPages alongside InertiaSharedProps', async () => {
      const sharedProps: SharedPropsResult = {
        typeString: '{ locale: string }',
        properties: [{ name: 'locale', type: 'string' }],
        isImportRef: false,
      };
      await emitPages(pages, outDir, { sharedProps });
      const content = await readFile(join(outDir, 'pages.d.ts'), 'utf8');
      expect(content).toContain('interface InertiaPages {');
      expect(content).toContain('interface InertiaSharedProps {');
    });
  });
});
