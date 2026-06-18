import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SsrLoaderService } from '../src/ssr/ssr-loader.service.js';

function tmpFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-ssr-retry-'));
  return join(dir, name);
}

const baseOpts = (overrides: Record<string, unknown> = {}) => ({
  ssr: { enabled: true, ...overrides },
});

describe('SsrLoaderService — retryable loader', () => {
  it('first load fails (bundle missing) → succeeds once the bundle appears on a later request', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    const svc = new SsrLoaderService(baseOpts({ bundlePath }) as never);

    // First request: bundle does not exist yet → transient failure → CSR fallback.
    const first = await svc.load();
    expect(first).toBeNull();

    // Bundle becomes available (e.g. build finished after boot).
    writeFileSync(
      bundlePath,
      `export const render = async () => ({ head: ['<title>Late</title>'], body: '<div>late</div>' });`,
    );

    // Later request: loader retries and now succeeds.
    const second = await svc.load();
    expect(second).not.toBeNull();
    expect(typeof second?.render).toBe('function');
    const result = await second!.render({ component: 'X', props: {}, url: '/', version: 'v' });
    expect(result.head).toEqual(['<title>Late</title>']);
  });

  it('gives up after exhausting maxRetries within the cooldown window', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    const svc = new SsrLoaderService(
      baseOpts({ bundlePath, retry: { maxRetries: 2, cooldownMs: 60_000 } }) as never,
    );

    // maxRetries: 2 → attempts allowed: initial + 2 retries = 3 total before giving up.
    expect(await svc.load()).toBeNull(); // attempt 1
    expect(await svc.load()).toBeNull(); // attempt 2
    expect(await svc.load()).toBeNull(); // attempt 3 (exhausts)

    // Now in cooldown — further calls short-circuit without attempting.
    expect(svc._attempts).toBe(3);
    await svc.load();
    expect(svc._attempts).toBe(3); // no new attempt while cooling down
  });

  it('resets and retries again after the cooldown window elapses', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    const svc = new SsrLoaderService(
      baseOpts({ bundlePath, retry: { maxRetries: 0, cooldownMs: 50 } }) as never,
    );

    expect(await svc.load()).toBeNull(); // attempt 1 exhausts (maxRetries: 0)
    expect(svc._attempts).toBe(1);

    // Within cooldown: no new attempt.
    await svc.load();
    expect(svc._attempts).toBe(1);

    // Make the bundle available, then wait out the cooldown.
    writeFileSync(
      bundlePath,
      `export const render = async () => ({ head: [], body: '<div>ok</div>' });`,
    );
    await new Promise((r) => setTimeout(r, 70));

    const mod = await svc.load();
    expect(mod).not.toBeNull();
  });

  it('explicit reset() clears the failure latch immediately', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    const svc = new SsrLoaderService(
      baseOpts({ bundlePath, retry: { maxRetries: 0, cooldownMs: 60_000 } }) as never,
    );
    expect(await svc.load()).toBeNull();
    expect(svc._attempts).toBe(1);

    writeFileSync(
      bundlePath,
      `export const render = async () => ({ head: [], body: '<div>r</div>' });`,
    );
    svc.reset();
    const mod = await svc.load();
    expect(mod).not.toBeNull();
  });

  it('still throws immediately when throwOnError is true (no silent retry)', async () => {
    const svc = new SsrLoaderService(
      baseOpts({ bundlePath: '/nonexistent/ssr.mjs', throwOnError: true }) as never,
    );
    await expect(svc.load()).rejects.toThrow();
  });
});

describe('SsrLoaderService — streaming entry detection', () => {
  it('exposes renderToStream when the bundle provides a named streaming export', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    writeFileSync(
      bundlePath,
      `export const render = async () => ({ head: [], body: '<div>buf</div>' });
       export const renderToStream = (page) => ({
         head: ['<title>S</title>'],
         pipe(writable) { writable.write('<div>stream</div>'); writable.end(); },
       });`,
    );
    const svc = new SsrLoaderService(baseOpts({ bundlePath }) as never);
    const mod = await svc.load();
    expect(mod).not.toBeNull();
    expect(typeof mod?.render).toBe('function');
    expect(typeof mod?.renderToStream).toBe('function');
  });

  it('exposes renderToStream from a default export', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    writeFileSync(
      bundlePath,
      `export default {
         render: async () => ({ head: [], body: '<div>buf</div>' }),
         renderToStream: (page) => ({ head: [], pipe(w) { w.end(); } }),
       };`,
    );
    const svc = new SsrLoaderService(baseOpts({ bundlePath }) as never);
    const mod = await svc.load();
    expect(typeof mod?.renderToStream).toBe('function');
  });

  it('renderToStream is undefined for a buffered-only bundle', async () => {
    const bundlePath = tmpFile('ssr.mjs');
    writeFileSync(
      bundlePath,
      `export const render = async () => ({ head: [], body: '<div>b</div>' });`,
    );
    const svc = new SsrLoaderService(baseOpts({ bundlePath }) as never);
    const mod = await svc.load();
    expect(typeof mod?.render).toBe('function');
    expect(mod?.renderToStream).toBeUndefined();
  });
});
