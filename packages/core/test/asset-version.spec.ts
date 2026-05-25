import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assetVersionProvider,
  computeAssetVersion,
  loadManifest,
  manifestProvider,
} from '../src/asset/version.provider.js';
import { makeNestedTmpManifest, makeTmpManifest } from './helpers/tmp-manifest.js';

const origCwd = process.cwd();

afterEach(() => {
  process.chdir(origCwd);
});

describe('loadManifest', () => {
  it('returns parsed manifest object from absolute path', () => {
    const path = makeTmpManifest({ 'app/client.tsx': { file: 'assets/x.js' } });
    const m = loadManifest(path);
    expect(m).toEqual({ 'app/client.tsx': { file: 'assets/x.js' } });
  });

  it('returns null when file does not exist', () => {
    expect(loadManifest('/nonexistent/manifest.json')).toBeNull();
  });

  it('returns null when file is invalid JSON', () => {
    const path = makeTmpManifest({});
    writeFileSync(path, 'not json');
    expect(loadManifest(path)).toBeNull();
  });

  it('resolves relative path against cwd', () => {
    const dir = makeNestedTmpManifest({ 'app/client.tsx': { file: 'x.js' } });
    process.chdir(dir);
    const m = loadManifest('dist/inertia/client/.vite/manifest.json');
    expect(m).not.toBeNull();
    expect(m).toHaveProperty('app/client.tsx');
  });

  // M-4: manifest shape validation
  describe('M-4: manifest shape validation', () => {
    it('throws clear error when manifest is an array (not an object)', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, '[]');
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
      expect(() => loadManifest(path)).toThrow('unexpected shape');
    });

    it('throws clear error when an entry is missing the "file" field', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, JSON.stringify({ 'app/client.tsx': { css: ['x.css'] } }));
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
      expect(() => loadManifest(path)).toThrow('"file"');
    });

    it('throws clear error when an entry is a primitive (not object)', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, JSON.stringify({ 'app/client.tsx': 'bad-value' }));
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
    });

    it('throws clear error when an entry is null', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, JSON.stringify({ 'app/client.tsx': null }));
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
      expect(() => loadManifest(path)).toThrow('not an object');
    });

    it('throws clear error when an entry is an array', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, JSON.stringify({ 'app/client.tsx': ['bad'] }));
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
      expect(() => loadManifest(path)).toThrow('not an object');
    });

    it('throws clear error when top-level is a primitive (null)', () => {
      const path = makeTmpManifest({});
      writeFileSync(path, 'null');
      expect(() => loadManifest(path)).toThrow('Vite manifest at');
      expect(() => loadManifest(path)).toThrow('unexpected shape');
    });

    it('accepts a valid manifest with file + optional css/imports', () => {
      const path = makeTmpManifest({
        'app/client.tsx': { file: 'assets/x.js', css: ['assets/x.css'], imports: ['a.js'] },
      });
      const m = loadManifest(path);
      expect(m).not.toBeNull();
      expect(m?.['app/client.tsx'].file).toBe('assets/x.js');
    });
  });
});

describe('computeAssetVersion', () => {
  it('returns SHA1 (32 chars) of manifest JSON when manifest is given', () => {
    const v = computeAssetVersion({ 'app/client.tsx': { file: 'x.js' } } as never);
    expect(v).toMatch(/^[a-f0-9]{32}$/);
  });

  it('returns stable hash for same manifest', () => {
    const m = { a: 1, b: 2 } as never;
    expect(computeAssetVersion(m)).toBe(computeAssetVersion(m));
  });

  it('returns different hash for different manifests', () => {
    expect(computeAssetVersion({ a: 1 } as never)).not.toBe(computeAssetVersion({ a: 2 } as never));
  });

  it('returns UUID (32 hex chars) when manifest is null', () => {
    const v = computeAssetVersion(null);
    expect(v).toMatch(/^[a-f0-9]{32}$/);
  });

  it('UUID branch is non-deterministic', () => {
    expect(computeAssetVersion(null)).not.toBe(computeAssetVersion(null));
  });
});

describe('assetVersionProvider.useFactory', () => {
  const factory = (assetVersionProvider as { useFactory: (...args: unknown[]) => unknown })
    .useFactory;

  it('returns opts.version string when provided', async () => {
    const result = await factory(null, { version: 'custom-v1' });
    expect(result).toBe('custom-v1');
  });

  it('calls opts.version function when provided', async () => {
    const result = await factory(null, { version: () => 'fn-v2' });
    expect(result).toBe('fn-v2');
  });

  it('calls async opts.version function when provided', async () => {
    const result = await factory(null, { version: async () => 'async-v3' });
    expect(result).toBe('async-v3');
  });

  it('falls back to computeAssetVersion when opts.version is undefined', async () => {
    const manifest = { 'app/client.tsx': { file: 'x.js' } };
    const result = await factory(manifest, {});
    expect(result).toMatch(/^[a-f0-9]{32}$/);
  });

  it('falls back to UUID when opts.version is undefined and manifest is null', async () => {
    const result = await factory(null, {});
    expect(result).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('manifestProvider.useFactory', () => {
  const factory = (manifestProvider as { useFactory: (...args: unknown[]) => unknown }).useFactory;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
  });

  it('returns null when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'test';
    const result = factory({});
    expect(result).toBeNull();
  });

  it('loads manifest when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    const path = makeTmpManifest({ 'app/client.tsx': { file: 'assets/x.js' } });
    const result = factory({ vite: { manifestPath: path } });
    expect(result).not.toBeNull();
    expect(result?.['app/client.tsx'].file).toBe('assets/x.js');
  });

  it('uses default manifest path when vite.manifestPath is not specified', () => {
    process.env.NODE_ENV = 'production';
    // Default path won't exist, so loadManifest returns null
    const result = factory({});
    expect(result).toBeNull();
  });
});
