import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SsrLoaderService } from '../src/ssr/ssr-loader.service.js';

function makeBundle(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-ssr-'));
  const file = join(dir, 'ssr.mjs');
  writeFileSync(file, body);
  return file;
}

const baseOpts = (overrides = {}) => ({ ssr: { enabled: true, ...overrides } });

describe('SsrLoaderService — real bundle loading', () => {
  it('returns null when ssr.enabled is false', async () => {
    const svc = new SsrLoaderService({ ssr: { enabled: false } } as never);
    expect(await svc.load()).toBeNull();
  });

  it('returns null when no opts.ssr at all', async () => {
    const svc = new SsrLoaderService({} as never);
    expect(await svc.load()).toBeNull();
  });

  it('loads a real SSR bundle and returns the module', async () => {
    const file = makeBundle(
      `export const render = async (page) => ({ head: ['<title>Real</title>'], body: '<div>X</div>' });`,
    );
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file }) as never);
    const mod = await svc.load();
    expect(mod).not.toBeNull();
    expect(typeof mod?.render).toBe('function');
    const result = await mod!.render({ component: 'X', props: {}, url: '/', version: 'v' });
    expect(result.head).toEqual(['<title>Real</title>']);
    expect(result.body).toBe('<div>X</div>');
  });

  it('caches the loaded module on subsequent load() calls', async () => {
    const file = makeBundle(`export const render = async () => ({ head: [], body: '' });`);
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file }) as never);
    const a = await svc.load();
    const b = await svc.load();
    expect(a).toBe(b);
  });

  it('returns null when bundle file is missing (default throwOnError=false)', async () => {
    const svc = new SsrLoaderService(baseOpts({ bundlePath: '/nonexistent/ssr.mjs' }) as never);
    expect(await svc.load()).toBeNull();
  });

  it('throws when throwOnError is true', async () => {
    const svc = new SsrLoaderService(
      baseOpts({ bundlePath: '/nonexistent/ssr.mjs', throwOnError: true }) as never,
    );
    await expect(svc.load()).rejects.toThrow();
  });

  it('memoizes the failed state — does not retry after first failure', async () => {
    const svc = new SsrLoaderService(baseOpts({ bundlePath: '/nonexistent/ssr.mjs' }) as never);
    const first = await svc.load();
    const second = await svc.load();
    expect(first).toBeNull();
    expect(second).toBeNull();
  });

  it('loads a bundle with default export containing render()', async () => {
    const file = makeBundle(
      `export default { render: async (page) => ({ head: ['<title>Default</title>'], body: '<div>D</div>' }) };`,
    );
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file }) as never);
    const mod = await svc.load();
    expect(mod).not.toBeNull();
    expect(typeof mod?.render).toBe('function');
    const result = await mod!.render({ component: 'X', props: {}, url: '/', version: 'v' });
    expect(result.head).toEqual(['<title>Default</title>']);
    expect(result.body).toBe('<div>D</div>');
  });

  it('returns null when bundle exports neither default.render nor named render (throwOnError=false)', async () => {
    const file = makeBundle('export const notRender = 42;');
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file }) as never);
    const mod = await svc.load();
    expect(mod).toBeNull();
  });

  it('throws when bundle exports neither default.render nor named render (throwOnError=true)', async () => {
    const file = makeBundle('export const notRender = 42;');
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file, throwOnError: true }) as never);
    await expect(svc.load()).rejects.toThrow(/neither default nor render/);
  });

  it('uses default bundlePath when not specified', async () => {
    // When no bundlePath is specified, it resolves to cwd + 'dist/inertia/ssr/ssr.mjs'
    // which won't exist — should return null (not throw) with default throwOnError=false
    const svc = new SsrLoaderService(baseOpts({}) as never);
    const mod = await svc.load();
    expect(mod).toBeNull();
  });

  it('returns null when default export exists but default.render is not a function', async () => {
    const file = makeBundle(`export default { render: 'not-a-function' };`);
    const svc = new SsrLoaderService(baseOpts({ bundlePath: file }) as never);
    const mod = await svc.load();
    expect(mod).toBeNull();
  });
});
