import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveredPage } from '../../src/discovery/pages.js';
import { emitCache } from '../../src/emit/emit-cache.js';
import { emitIndex } from '../../src/emit/emit-index.js';

describe('emitCache', () => {
  let outDir: string;
  let pagesDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'emit-cache-'));
    pagesDir = join(outDir, 'pages');
    await mkdir(pagesDir, { recursive: true });
    // Create real files so stat() can get mtime
    await writeFile(
      join(pagesDir, 'Dashboard.tsx'),
      'export default function Dashboard() { return null; }',
    );
    await writeFile(join(pagesDir, 'Foo.tsx'), 'export default function Foo() { return null; }');
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  const makePages = (pagesDir: string): DiscoveredPage[] => [
    {
      name: 'Dashboard',
      absolutePath: join(pagesDir, 'Dashboard.tsx'),
      relativePath: 'Dashboard.tsx',
      propsSource: '{ count: number }',
    },
    {
      name: 'Foo',
      absolutePath: join(pagesDir, 'Foo.tsx'),
      relativePath: 'Foo.tsx',
      propsSource: null,
    },
  ];

  it('writes components.json to outDir', async () => {
    const pages = makePages(pagesDir);
    await emitCache(pages, outDir);
    const raw = await readFile(join(outDir, 'components.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json).toHaveProperty('pages');
    expect(Array.isArray(json.pages)).toBe(true);
  });

  it('includes name and relativePath in each entry', async () => {
    const pages = makePages(pagesDir);
    await emitCache(pages, outDir);
    const raw = await readFile(join(outDir, 'components.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json.pages).toHaveLength(2);
    const dash = json.pages.find((p: { name: string }) => p.name === 'Dashboard');
    expect(dash).toBeDefined();
    expect(dash.relativePath).toBe('Dashboard.tsx');
  });

  it('includes mtime for each entry', async () => {
    const pages = makePages(pagesDir);
    await emitCache(pages, outDir);
    const raw = await readFile(join(outDir, 'components.json'), 'utf8');
    const json = JSON.parse(raw);
    const dash = json.pages.find((p: { name: string }) => p.name === 'Dashboard');
    expect(typeof dash.mtime).toBe('string');
    // Should be a valid ISO date string
    expect(() => new Date(dash.mtime)).not.toThrow();
  });

  it('creates outDir if it does not exist', async () => {
    const nestedOut = join(outDir, 'nested', '.nestjs-inertia');
    const pages = makePages(pagesDir);
    await emitCache(pages, nestedOut);
    const raw = await readFile(join(nestedOut, 'components.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json).toHaveProperty('pages');
  });
});

describe('emitIndex', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'emit-index-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('writes index.d.ts to outDir', async () => {
    await emitIndex(outDir);
    const content = await readFile(join(outDir, 'index.d.ts'), 'utf8');
    expect(content).toContain("export * from './pages.js'");
    expect(content).toContain("export * from './routes.js'");
    // shared-props.js is never generated — must NOT appear to avoid ENOENT
    expect(content).not.toContain('shared-props');
  });

  it('creates outDir if it does not exist', async () => {
    const nestedOut = join(outDir, 'nested', '.nestjs-inertia');
    await emitIndex(nestedOut);
    const content = await readFile(join(nestedOut, 'index.d.ts'), 'utf8');
    expect(content).toContain("export * from './pages.js'");
  });
});
