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
  it('loads HTML template and expands @inertia directive (v3: script[data-page])', async () => {
    const path = makeRoot('<!doctype html><body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(path);
    const html = await renderer.render({
      page: { component: 'Home', props: {}, url: '/', version: 'v1' },
      ssr: null,
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).toContain('<div id="app">');
    expect(html).toContain('<script data-page="app" type="application/json">');
  });

  it('marks the SSR mount with data-server-rendered when an SSR body is present', async () => {
    const path = makeRoot('<!doctype html><body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(path);
    const html = await renderer.render({
      page: { component: 'Home', props: {}, url: '/', version: 'v1' },
      ssr: { head: [], body: '<div id="app">PRE-RENDERED</div>' },
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).toContain('<div id="app" data-server-rendered="true">PRE-RENDERED</div>');
  });

  it('does not mark the mount as server-rendered on a CSR (no SSR body) render', async () => {
    const path = makeRoot('<!doctype html><body>@inertia</body>');
    const renderer = new FileBasedShellRenderer(path);
    const html = await renderer.render({
      page: { component: 'Home', props: {}, url: '/', version: 'v1' },
      ssr: null,
      manifest: null,
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).not.toContain('data-server-rendered');
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
    expect(html).toContain('<div id="app">');
    expect(html).toContain('<script data-page="app" type="application/json">');
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

describe('FileBasedShellRenderer — template engines and directives in page data', () => {
  const render = (renderer: FileBasedShellRenderer, props: Record<string, unknown>) =>
    renderer.render({
      page: { component: 'H', props, url: '/', version: 'v1' },
      ssr: null,
      manifest: { 'app.tsx': { file: 'assets/app-x.js' } },
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });

  it('embeds the page JSON once when a prop contains @inertia', async () => {
    const renderer = new FileBasedShellRenderer(makeRoot('<body>{{{inertia}}}</body>', 'hbs'));
    const html = await render(renderer, { note: 'ping @inertia team' });
    expect(html.match(/<script data-page="app"/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('ping @inertia team');
  });

  it('does not run a manifest lookup for @vite(...) inside props', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const renderer = new FileBasedShellRenderer(
        makeRoot('<head>{{{vite "app.tsx"}}}</head><body>{{{inertia}}}</body>', 'hbs'),
      );
      const html = await render(renderer, { note: "@vite('missing.tsx') @asset('app.tsx')" });
      expect(html).toContain('/assets/app-x.js');
      expect(html).toContain("@vite('missing.tsx') @asset('app.tsx')");
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('leaves directives inside the SSR head and body alone', async () => {
    const renderer = new FileBasedShellRenderer(
      makeRoot('<head>{{{inertiaHead}}}</head><body>{{{inertia}}}</body>', 'hbs'),
    );
    const html = await renderer.render({
      page: { component: 'H', props: {}, url: '/', version: 'v1' },
      ssr: {
        head: ['<title>@inertia @viteRefresh</title>'],
        body: '<div id="app">@vite(\'missing.tsx\') @inertiaHead</div>',
      },
      manifest: {},
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
    expect(html).toBe(
      '<head><title>@inertia @viteRefresh</title></head><body><div id="app" data-server-rendered="true">@vite(\'missing.tsx\') @inertiaHead</div></body>',
    );
  });

  it('still expands directives written into the template next to engine syntax', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const renderer = new FileBasedShellRenderer(
        makeRoot(
          "<head>@vite('app.tsx')<link href=\"@asset('app.tsx')\"></head><body>{{#if page}}@inertia{{/if}}</body>",
          'hbs',
        ),
      );
      const html = await render(renderer, { note: '@inertia' });
      expect(html).toContain('<script type="module" src="/assets/app-x.js"></script>');
      expect(html).toContain('<link href="/assets/app-x.js">');
      expect(html.match(/<script data-page="app"/g)).toHaveLength(1);
      expect(html).not.toContain('nestjsinertia');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('expands directives in pug attribute values and text', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const renderer = new FileBasedShellRenderer(
        makeRoot(
          'html\n  head\n    link(href="@asset(\'app.tsx\')")\n  body\n    | @inertia\n',
          'pug',
        ),
      );
      const html = await render(renderer, { note: '@inertia' });
      expect(html).toContain('<link href="/assets/app-x.js"/>');
      expect(html.match(/<script data-page="app"/g)).toHaveLength(1);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('FileBasedShellRenderer — directives in partials and includes', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  function makeViews(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-partials-'));
    mkdirSync(join(dir, 'inertia'));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, 'inertia', name), content);
    }
    process.chdir(dir);
    return dir;
  }

  async function renderRoot(rootView: string) {
    process.env.NODE_ENV = 'production';
    const renderer = new FileBasedShellRenderer(rootView);
    return renderer.render({
      page: {
        component: 'H',
        props: { note: "@vite('missing.tsx') @inertia" },
        url: '/',
        version: 'v1',
      },
      ssr: null,
      manifest: { 'app.tsx': { file: 'assets/app-x.js' } },
      assetVersion: 'v1',
      ctx: { req: {}, res: {} },
    });
  }

  function expectExpanded(html: string) {
    expect(html).toContain('<script type="module" src="/assets/app-x.js"></script>');
    expect(html.match(/<script data-page="app"/g)).toHaveLength(1);
    expect(html).toContain("@vite('missing.tsx') @inertia");
    expect(html).not.toContain('nestjsinertia');
  }

  it('expands directives in a Handlebars partial', async () => {
    const { default: Handlebars } = await import('handlebars');
    Handlebars.registerPartial('appHead', "@vite('app.tsx')");
    Handlebars.registerPartial('appBody', '@inertia');
    try {
      makeViews({ 'root.hbs': '<head>{{> appHead}}</head><body>{{> appBody}}</body>' });
      expectExpanded(await renderRoot('inertia/root.hbs'));
    } finally {
      Handlebars.unregisterPartial('appHead');
      Handlebars.unregisterPartial('appBody');
    }
  });

  it('expands directives in an EJS include', async () => {
    makeViews({
      'root.ejs': "<head><%- include('head') %></head><body><%- include('body') %></body>",
      'head.ejs': "@vite('app.tsx')",
      'body.ejs': '@inertia',
    });
    expectExpanded(await renderRoot('inertia/root.ejs'));
  });

  it('expands directives in a Pug include', async () => {
    makeViews({
      'root.pug': 'html\n  head\n    include head.pug\n  body\n    include body.pug\n',
      'head.pug': "| @vite('app.tsx')\n",
      'body.pug': '| @inertia\n',
    });
    expectExpanded(await renderRoot('inertia/root.pug'));
  });

  it('expands directives in a Liquid include', async () => {
    makeViews({
      'root.liquid':
        "<head>{% include 'inertia/head.liquid' %}</head><body>{% include 'inertia/body.liquid' %}</body>",
      'head.liquid': "@vite('app.tsx')",
      'body.liquid': '@inertia',
    });
    expectExpanded(await renderRoot('inertia/root.liquid'));
  });
});
