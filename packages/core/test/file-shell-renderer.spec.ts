import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UnsupportedRootViewExtensionException } from '../src/index.js';
import { FileBasedShellRenderer } from '../src/shell/file-shell.renderer.js';

const origCwd = process.cwd();
afterEach(() => process.chdir(origCwd));

function makeRoot(content: string, ext = 'html'): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-shell-'));
  const sub = join(dir, 'inertia');
  mkdirSync(sub);
  const file = join(sub, `root.${ext}`);
  writeFileSync(file, content);
  process.chdir(dir);
  return `inertia/root.${ext}`;
}

describe('FileBasedShellRenderer', () => {
  it('loads HTML template and expands @inertia directive', async () => {
    const path = makeRoot('<!doctype html><body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(path);
    const html = await renderer.render({
      page: { component: 'Home', props: {}, url: '/', version: 'v1' },
      ssr: null,
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).toContain('<div id="app"');
    expect(html).toContain('data-page=');
  });

  it('throws UnsupportedRootViewExtensionException for unsupported extension', () => {
    expect(() => new FileBasedShellRenderer('inertia/root.txt')).toThrow(
      UnsupportedRootViewExtensionException,
    );
  });

  it('caches the file contents after first read', async () => {
    const path = makeRoot('<body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(path);
    const ctx = {
      page: { component: 'H', props: {}, url: '/', version: 'v1' },
      ssr: null,
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    };
    const html1 = await renderer.render(ctx);
    const html2 = await renderer.render(ctx);
    expect(html1).toBe(html2);
  });

  it('uses absolute path when given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-shell-abs-'));
    const file = join(dir, 'root.html');
    writeFileSync(file, '<body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(file);
    const html = await renderer.render({
      page: { component: 'H', props: {}, url: '/', version: 'v1' },
      ssr: null,
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).toContain('<div id="app"');
  });

  it('detects dev mode from process.env.NODE_ENV', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const path = makeRoot("<body>@vite('app.tsx')</body>");
      const renderer = new FileBasedShellRenderer(path);
      const html = await renderer.render({
        page: { component: 'H', props: {}, url: '/', version: 'v1' },
        ssr: null,
        manifest: { 'app.tsx': { file: 'assets/app-x.js' } },
        assetVersion: 'v1',
        ctx: { req: {}, res: {} },
      });
      expect(html).toContain('/assets/app-x.js');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
