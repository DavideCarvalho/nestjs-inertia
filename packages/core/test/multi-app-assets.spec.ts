/**
 * Two Inertia apps in one Nest app, the second mounted under a path prefix.
 *
 * - `vite.base` is the public URL prefix of an app's Vite build (Vite's `base`): `@vite` and
 *   `@asset` emit `<base><file>` instead of the root-absolute `/<file>`, so an app built with
 *   `base: '/m/'` into its own `dist/` is served at `/m/assets/…` without writing its assets
 *   into an `m/assets` sub-directory.
 * - Each `forFeature` scope's asset version is its own by default: two apps never share one,
 *   so an Inertia visit from one app to the other is answered 409 + a full page load, even in
 *   development where no manifest distinguishes them.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../src/asset/version.provider.js';
import { InertiaModule } from '../src/index.js';
import { type DirectiveContext, processDirectives } from '../src/shell/directives.js';
import { FileBasedShellRenderer } from '../src/shell/file-shell.renderer.js';
import type { ShellRenderer } from '../src/shell/shell.js';
import { INERTIA_ASSET_VERSION, featureToken } from '../src/tokens.js';

const manifest: Manifest = {
  'inertia/app/client.tsx': { file: 'assets/client-abc.js', css: ['assets/client-def.css'] },
  'favicon.svg': { file: 'assets/favicon-123.svg' },
};

const ctx = (overrides: Partial<DirectiveContext> = {}): DirectiveContext => ({
  pageJson: '{}',
  ssrHead: '',
  ssrBody: null,
  manifest,
  isDev: false,
  ...overrides,
});

describe('vite.base in the @vite / @asset directives', () => {
  it('prefixes the built entry and its CSS in production', () => {
    const out = processDirectives("@vite('inertia/app/client.tsx')", ctx({ base: '/m/' }));
    expect(out).toContain('<script type="module" src="/m/assets/client-abc.js"></script>');
    expect(out).toContain('<link rel="stylesheet" href="/m/assets/client-def.css" />');
  });

  it('prefixes the dev client, the React Refresh runtime and the entry in development', () => {
    const out = processDirectives(
      "@viteRefresh @vite('inertia/app/client.tsx')",
      ctx({ base: '/m/', isDev: true, manifest: null }),
    );
    expect(out).toContain('<script type="module" src="/m/@vite/client"></script>');
    expect(out).toContain('import RefreshRuntime from "/m/@react-refresh"');
    expect(out).toContain('<script type="module" src="/m/inertia/app/client.tsx"></script>');
    expect(out).not.toMatch(/"\/@/);
  });

  it('prefixes @asset, with and without a manifest entry', () => {
    expect(processDirectives("@asset('favicon.svg')", ctx({ base: '/m/' }))).toBe(
      '/m/assets/favicon-123.svg',
    );
    expect(processDirectives("@asset('sw.js')", ctx({ base: '/m/' }))).toBe('/m/sw.js');
    expect(
      processDirectives("@asset('sw.js')", ctx({ base: '/m/', isDev: true, manifest: null })),
    ).toBe('/m/sw.js');
  });

  it('normalizes the slashes, and keeps a CDN URL as is', () => {
    expect(processDirectives("@asset('favicon.svg')", ctx({ base: 'm' }))).toBe(
      '/m/assets/favicon-123.svg',
    );
    expect(processDirectives("@asset('favicon.svg')", ctx({ base: '/m' }))).toBe(
      '/m/assets/favicon-123.svg',
    );
    expect(
      processDirectives("@asset('favicon.svg')", ctx({ base: 'https://cdn.example.com/m' })),
    ).toBe('https://cdn.example.com/m/assets/favicon-123.svg');
  });

  it('defaults to "/" (unchanged output without a base)', () => {
    expect(processDirectives("@vite('inertia/app/client.tsx')", ctx())).toContain(
      'src="/assets/client-abc.js"',
    );
  });
});

describe('vite.base through the module', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  function rootView(): { rootView: string; manifestPath: string } {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-multi-app-'));
    mkdirSync(join(dir, '.vite'));
    writeFileSync(join(dir, '.vite/manifest.json'), JSON.stringify(manifest));
    writeFileSync(
      join(dir, 'index.html'),
      "<html><head>@vite('inertia/app/client.tsx')</head><body>@inertia</body></html>",
    );
    return { rootView: join(dir, 'index.html'), manifestPath: join(dir, '.vite/manifest.json') };
  }

  const render = (renderer: ShellRenderer, loaded: Manifest | null) =>
    renderer.render({
      page: { component: 'minimal/Home', props: {}, url: '/m', version: 'v' },
      ssr: null,
      manifest: loaded,
      assetVersion: 'v',
      ctx: { req: {}, res: {} },
    });

  it('a forFeature scope renders its own build under its base', async () => {
    process.env.NODE_ENV = 'production';
    const web = rootView();
    const minimal = rootView();
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({
          rootView: web.rootView,
          vite: { entry: 'inertia/app/client.tsx', manifestPath: web.manifestPath },
        }),
        InertiaModule.forFeature({
          scope: 'minimal',
          rootView: minimal.rootView,
          vite: {
            entry: 'inertia/app/client.tsx',
            manifestPath: minimal.manifestPath,
            base: '/m/',
          },
        }),
      ],
    }).compile();

    const minimalHtml = await render(
      moduleRef.get(featureToken('SHELL_RENDERER', 'minimal')),
      moduleRef.get(featureToken('MANIFEST', 'minimal')),
    );
    expect(minimalHtml).toContain('src="/m/assets/client-abc.js"');

    const webHtml = await render(moduleRef.get('INERTIA_SHELL_RENDERER'), manifest);
    expect(webHtml).toContain('src="/assets/client-abc.js"');
  });

  it('FileBasedShellRenderer takes the base directly', async () => {
    process.env.NODE_ENV = 'production';
    const { rootView: path } = rootView();
    const html = await render(new FileBasedShellRenderer(path, { base: '/admin/' }), manifest);
    expect(html).toContain('src="/admin/assets/client-abc.js"');
  });
});

describe('asset version per scope', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  async function versions(
    ...features: Array<{ scope: string; version?: string }>
  ): Promise<Record<string, string>> {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({}), ...features.map((f) => InertiaModule.forFeature(f))],
    }).compile();
    return {
      default: moduleRef.get<string>(INERTIA_ASSET_VERSION),
      ...Object.fromEntries(
        features.map((f) => [
          f.scope,
          moduleRef.get<string>(featureToken('ASSET_VERSION', f.scope)),
        ]),
      ),
    };
  }

  it('differs between apps in development (no manifest), so cross-app visits reload', async () => {
    process.env.NODE_ENV = 'development';
    const v = await versions({ scope: 'minimal' }, { scope: 'admin' });
    expect(new Set([v.default, v.minimal, v.admin]).size).toBe(3);
  });

  it('is stable for a scope across boots', async () => {
    process.env.NODE_ENV = 'development';
    const first = await versions({ scope: 'minimal' });
    const second = await versions({ scope: 'minimal' });
    expect(second.minimal).toBe(first.minimal);
  });

  it('differs even when two scopes read the same manifest', async () => {
    process.env.NODE_ENV = 'production';
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-shared-manifest-'));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({
          vite: { entry: 'a.tsx', manifestPath: join(dir, 'manifest.json') },
        }),
        InertiaModule.forFeature({
          scope: 'minimal',
          vite: { entry: 'b.tsx', manifestPath: join(dir, 'manifest.json') },
        }),
      ],
    }).compile();
    expect(moduleRef.get(featureToken('ASSET_VERSION', 'minimal'))).not.toBe(
      moduleRef.get(INERTIA_ASSET_VERSION),
    );
  });

  it('keeps an explicit version as given', async () => {
    process.env.NODE_ENV = 'development';
    const v = await versions({ scope: 'minimal', version: 'minimal-dev' });
    expect(v.minimal).toBe('minimal-dev');
  });
});
