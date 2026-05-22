import { describe, it, expect, afterEach } from 'vitest';
import { loadManifest, computeAssetVersion } from '../src/asset/version.provider.js';
import { makeTmpManifest, makeNestedTmpManifest } from './helpers/tmp-manifest.js';
import { writeFileSync } from 'node:fs';

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
