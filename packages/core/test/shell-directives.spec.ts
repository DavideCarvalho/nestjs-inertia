import { describe, expect, it } from 'vitest';
import type { Manifest } from '../src/asset/version.provider.js';
import { type DirectiveContext, processDirectives } from '../src/shell/directives.js';

const baseCtx = (overrides: Partial<DirectiveContext> = {}): DirectiveContext => ({
  pageJson: '{"component":"Home"}',
  ssrHead: '',
  ssrBody: null,
  manifest: null,
  isDev: true,
  ...overrides,
});

describe('processDirectives', () => {
  it('@inertia expands to <div id="app"> + <script id="inertia-page" type="application/json"> in CSR mode (v3)', () => {
    const out = processDirectives('<body>@inertia</body>', baseCtx());
    expect(out).toContain('<div id="app">');
    expect(out).toContain('<script id="inertia-page" type="application/json">');
    expect(out).toContain('{"component":"Home"}');
    expect(out).not.toContain('data-page=');
  });

  it('@inertia expands to SSR body when ssrBody is present', () => {
    const out = processDirectives(
      '<body>@inertia</body>',
      baseCtx({
        ssrBody: '<div id="app">PRE-RENDERED</div>',
      }),
    );
    expect(out).toContain('PRE-RENDERED');
    expect(out).not.toContain('data-page=');
  });

  it('@inertiaHead expands to SSR head string (empty by default)', () => {
    const out = processDirectives('<head>@inertiaHead</head>', baseCtx());
    expect(out).toBe('<head></head>');
  });

  it('@inertiaHead includes SSR head when provided', () => {
    const out = processDirectives(
      '<head>@inertiaHead</head>',
      baseCtx({
        ssrHead: '<title>My Page</title>\n<meta name="x" />',
      }),
    );
    expect(out).toContain('<title>My Page</title>');
    expect(out).toContain('<meta name="x" />');
  });

  it('@vite(entry) in dev: emits @vite/client + raw entry script', () => {
    const out = processDirectives("@vite('app/client.tsx')", baseCtx({ isDev: true }));
    expect(out).toContain('/@vite/client');
    expect(out).toContain('/app/client.tsx');
  });

  it('@vite(entry) in prod: emits hashed bundle from manifest', () => {
    const manifest: Manifest = {
      'app/client.tsx': { file: 'assets/client-abc123.js', css: ['assets/client.css'] },
    };
    const out = processDirectives(
      "@vite('app/client.tsx')",
      baseCtx({
        isDev: false,
        manifest,
      }),
    );
    expect(out).toContain('/assets/client-abc123.js');
    expect(out).toContain('/assets/client.css');
  });

  it('@vite(entry) in prod throws when entry not in manifest', () => {
    expect(() =>
      processDirectives(
        "@vite('missing.tsx')",
        baseCtx({
          isDev: false,
          manifest: {},
        }),
      ),
    ).toThrow(/manifest entry.*missing\.tsx/i);
  });

  it('@viteRefresh in dev emits React Refresh preamble', () => {
    const out = processDirectives('@viteRefresh', baseCtx({ isDev: true }));
    expect(out).toContain('RefreshRuntime');
    expect(out).toContain('__vite_plugin_react_preamble_installed__');
  });

  it('@viteRefresh in prod emits empty', () => {
    const out = processDirectives('@viteRefresh', baseCtx({ isDev: false, manifest: {} }));
    expect(out).toBe('');
  });

  it('@asset in dev returns raw path', () => {
    const out = processDirectives("@asset('favicon.svg')", baseCtx({ isDev: true }));
    expect(out).toBe('/favicon.svg');
  });

  it('@asset in prod returns hashed path from manifest', () => {
    const manifest: Manifest = { 'favicon.svg': { file: 'assets/favicon-xyz.svg' } };
    const out = processDirectives(
      "@asset('favicon.svg')",
      baseCtx({
        isDev: false,
        manifest,
      }),
    );
    expect(out).toBe('/assets/favicon-xyz.svg');
  });

  it('@asset returns raw path in prod when not in manifest (fallback)', () => {
    const out = processDirectives(
      "@asset('static/logo.png')",
      baseCtx({
        isDev: false,
        manifest: {},
      }),
    );
    expect(out).toBe('/static/logo.png');
  });

  it('multiple directives in one template all expanded', () => {
    const template = `
      <head>@inertiaHead@vite('app/client.tsx')@viteRefresh</head>
      <body>@inertia</body>
    `;
    const out = processDirectives(template, baseCtx({ isDev: true }));
    expect(out).toContain('/@vite/client');
    expect(out).toContain('/app/client.tsx');
    expect(out).toContain('RefreshRuntime');
    expect(out).toContain('<script id="inertia-page" type="application/json">');
    expect(out).not.toContain('data-page=');
  });
});
