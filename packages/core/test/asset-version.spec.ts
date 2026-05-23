import { writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { computeAssetVersion, loadManifest } from '../src/asset/version.provider.js';
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
