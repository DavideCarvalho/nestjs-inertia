import { describe, expect, it, vi } from 'vitest';
import type { SsrModule } from '../src/service.js';
import { InertiaService } from '../src/service.js';
import { DefaultShellRenderer } from '../src/shell/shell.js';
import { fakeRequest } from './helpers/fake-request.js';
import { fakeResponse } from './helpers/fake-response.js';

const shell = new DefaultShellRenderer();

function buildDeps(ssrModule: SsrModule | null, streaming: boolean) {
  return {
    assetVersion: 'v1',
    manifest: null,
    ssrLoader: { load: async () => ssrModule },
    rootViewRender: (ctx: Parameters<typeof shell.render>[0]) => shell.render(ctx),
    rootViewRenderToParts: (ctx: Parameters<typeof shell.renderToParts>[0]) =>
      shell.renderToParts(ctx),
    ssrStreaming: streaming,
    moduleShare: undefined,
    featureShare: undefined,
    historyEncryptionDefault: false,
    flashStore: undefined,
  };
}

/** Buffered-only bundle. */
const bufferedBundle: SsrModule = {
  render: async (page) => ({
    head: ['<title>Buffered</title>'],
    body: `<div id="app" data-c="${page.component}">APP-BODY</div>`,
  }),
};

/** Streaming bundle that writes the app HTML in several chunks. */
const streamingBundle: SsrModule = {
  render: async (page) => ({
    head: ['<title>Buffered</title>'],
    body: `<div id="app" data-c="${page.component}">CHUNK-1CHUNK-2</div>`,
  }),
  renderToStream: (page) => ({
    head: ['<title>Buffered</title>'],
    pipe(writable) {
      writable.write(`<div id="app" data-c="${page.component}">`);
      writable.write('CHUNK-1');
      writable.write('CHUNK-2');
      writable.end('</div>');
    },
  }),
};

describe('InertiaService SSR streaming', () => {
  it('streams chunks progressively when streaming enabled and bundle supports it', async () => {
    const req = fakeRequest();
    const res = fakeResponse();
    const svc = new InertiaService(req, res, buildDeps(streamingBundle, true));

    await svc.render('Home', { x: 1 });

    // Multiple progressive writes (head flush + bundle chunks + tail) — not one buffered html() call.
    expect(res._captured.streamed).toBe(true);
    expect(res._captured.bodyHtml).toBeUndefined; // set only on end via chunks join
    expect(res._captured.ended).toBe(true);
    // At minimum: head, "<div...>", CHUNK-1, CHUNK-2, "</div>", tail = several writes.
    expect(res._captured.chunks.length).toBeGreaterThan(2);

    const full = res._captured.chunks.join('');
    expect(full).toContain('CHUNK-1');
    expect(full).toContain('CHUNK-2');
    expect(full).toContain('data-c="Home"');
    // Shell head flushed before app body chunk (DefaultShellRenderer's <head>).
    const headIdx = full.indexOf('</head>');
    const bodyIdx = full.indexOf('CHUNK-1');
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(headIdx).toBeLessThan(bodyIdx);
    // The shell head was the FIRST flushed chunk.
    expect(res._captured.chunks[0]).toContain('</head>');
    // Tail (data-page script) after the app body.
    expect(full.indexOf('data-page="app"')).toBeGreaterThan(bodyIdx);
  });

  it('produces the same final HTML as the buffered path', async () => {
    // Streamed render.
    const resStream = fakeResponse();
    await new InertiaService(fakeRequest(), resStream, buildDeps(streamingBundle, true)).render(
      'Home',
      { x: 1 },
    );
    const streamedHtml = resStream._captured.chunks.join('');

    // Buffered render of a bundle whose buffered body equals the streamed body.
    const equivBuffered: SsrModule = {
      render: async (page) => ({
        head: ['<title>Buffered</title>'],
        body: `<div id="app" data-c="${page.component}">CHUNK-1CHUNK-2</div>`,
      }),
    };
    const resBuf = fakeResponse();
    await new InertiaService(fakeRequest(), resBuf, buildDeps(equivBuffered, false)).render(
      'Home',
      {
        x: 1,
      },
    );
    const bufferedHtml = resBuf._captured.bodyHtml as string;

    expect(streamedHtml).toBe(bufferedHtml);
  });

  it('falls back to buffered html() when bundle has no streaming entry', async () => {
    const res = fakeResponse();
    await new InertiaService(fakeRequest(), res, buildDeps(bufferedBundle, true)).render('Home');
    expect(res._captured.streamed).toBe(false);
    expect(res._captured.bodyHtml).toContain('APP-BODY');
  });

  it('does not stream when streaming option is disabled even if bundle supports it', async () => {
    const res = fakeResponse();
    await new InertiaService(fakeRequest(), res, buildDeps(streamingBundle, false)).render('Home');
    expect(res._captured.streamed).toBe(false);
    expect(res._captured.bodyHtml).toContain('CHUNK-1');
  });

  it('XHR (X-Inertia) requests are unaffected by streaming and still return JSON', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    await new InertiaService(req, res, buildDeps(streamingBundle, true)).render('Home', { a: 1 });
    expect(res._captured.streamed).toBe(false);
    expect(res._captured.body).toMatchObject({ component: 'Home' });
  });

  it('falls back to buffered SSR when renderToStream throws during setup (no bytes written)', async () => {
    const flaky: SsrModule = {
      render: async () => ({ head: [], body: '<div id="app">FALLBACK</div>' }),
      renderToStream: () => {
        throw new Error('boom');
      },
    };
    const res = fakeResponse();
    const svc = new InertiaService(fakeRequest(), res, buildDeps(flaky, true));
    await svc.render('Home');
    expect(res._captured.streamed).toBe(false);
    expect(res._captured.bodyHtml).toContain('FALLBACK');
  });

  it('calls renderToStream (not render) on the streaming path', async () => {
    const renderSpy = vi.fn(async () => ({ head: [], body: '<div>buf</div>' }));
    const streamSpy = vi.fn((_page: unknown) => ({
      head: [] as string[],
      pipe(w: { write(c: string): boolean; end(c?: string): void }) {
        w.end('<div id="app">streamed</div>');
      },
    }));
    const bundle = { render: renderSpy, renderToStream: streamSpy } as unknown as SsrModule;
    const res = fakeResponse();
    await new InertiaService(fakeRequest(), res, buildDeps(bundle, true)).render('Home');
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
