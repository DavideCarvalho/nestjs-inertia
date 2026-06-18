import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileBasedShellRenderer } from '../../src/shell/file-shell.renderer.js';
import { DefaultShellRenderer } from '../../src/shell/shell.js';

const origCwd = process.cwd();
afterEach(() => process.chdir(origCwd));

function makeRoot(content: string, ext = 'html'): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-parts-'));
  const sub = join(dir, 'inertia');
  mkdirSync(sub);
  const file = join(sub, `root.${ext}`);
  writeFileSync(file, content);
  process.chdir(dir);
  return `inertia/root.${ext}`;
}

const baseCtx = {
  page: { component: 'Home', props: { x: 1 }, url: '/', version: 'v1' },
  ssr: { head: ['<title>S</title>'], body: '' },
  manifest: null,
  assetVersion: 'v1',
  ctx: { req: {}, res: {} },
};

describe('DefaultShellRenderer.renderToParts', () => {
  it('splits into head + tail with no sentinel leaking, app body goes between', async () => {
    const r = new DefaultShellRenderer();
    const { head, tail } = await r.renderToParts(baseCtx);
    expect(head).not.toContain('nestjs-inertia-ssr-body');
    expect(tail).not.toContain('nestjs-inertia-ssr-body');
    // head ends before body mount, tail carries the data-page script.
    expect(head).toContain('<body>');
    expect(tail).toContain('data-page="app"');
    // Reassembling head + appBody + tail equals the buffered render with that body.
    const reassembled = `${head}<div id="app">APP</div>${tail}`;
    const buffered = await r.render({
      ...baseCtx,
      ssr: { head: ['<title>S</title>'], body: '<div id="app">APP</div>' },
    });
    expect(reassembled).toBe(buffered);
  });
});

describe('FileBasedShellRenderer.renderToParts', () => {
  it('splits a @inertia template into head/tail around the app body', async () => {
    const path = makeRoot(
      '<!doctype html><html><head>@inertiaHead</head><body>@inertia</body></html>',
    );
    const r = new FileBasedShellRenderer(path);
    const { head, tail } = await r.renderToParts(baseCtx);
    expect(head).not.toContain('nestjs-inertia-ssr-body');
    expect(tail).not.toContain('nestjs-inertia-ssr-body');
    expect(head).toContain('<title>S</title>'); // @inertiaHead expanded into head part
    expect(head).toContain('<body>');
    expect(tail).toContain('</body>');
    // Reassembly equals a buffered render with the same body.
    const reassembled = `${head}<div id="app">APP</div>${tail}`;
    const buffered = await r.render({
      ...baseCtx,
      ssr: { head: ['<title>S</title>'], body: '<div id="app">APP</div>' },
    });
    expect(reassembled).toBe(buffered);
  });
});
