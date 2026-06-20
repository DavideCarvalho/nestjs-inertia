import { mkdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveBarePackageTypes } from '../../src/discovery/type-ref-resolution.js';

/**
 * A `@Filterable({ entity: X })` whose entity is published in a dependency (not
 * declared in `src/`) used to be mis-resolved: `resolveModuleSpecifier` returned
 * `[]` for bare specifiers, so the route emitted as a non-filter stub
 * (`body: never`). `resolveBarePackageTypes` follows the package's `.d.ts`.
 */
describe('resolveBarePackageTypes', () => {
  let root: string;
  // A source file deep enough that createRequire walks up into `<root>/node_modules`.
  let fromFile: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bare-pkg-'));
    fromFile = join(root, 'src', 'filter.ts');
    mkdirSync(join(root, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writePkg(name: string, pkgJson: Record<string, unknown>): Promise<string> {
    const dir = join(root, 'node_modules', ...name.split('/'));
    mkdirSync(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkgJson));
    return dir;
  }

  it('resolves the root export via `exports["."].import.types`', async () => {
    const dir = await writePkg('@scope/entities', {
      name: '@scope/entities',
      exports: { '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } } },
    });
    const candidates = resolveBarePackageTypes('@scope/entities', fromFile);
    expect(candidates).toContain(join(dir, 'dist', 'index.d.ts'));
  });

  it('maps a JS-only export entry to its sibling declaration file', async () => {
    const dir = await writePkg('plain-pkg', {
      name: 'plain-pkg',
      exports: { '.': { import: './dist/index.js' } },
    });
    const candidates = resolveBarePackageTypes('plain-pkg', fromFile);
    expect(candidates).toContain(join(dir, 'dist', 'index.d.ts'));
  });

  it('falls back to top-level `types`', async () => {
    const dir = await writePkg('typed-pkg', {
      name: 'typed-pkg',
      types: './dist/index.d.ts',
    });
    const candidates = resolveBarePackageTypes('typed-pkg', fromFile);
    expect(candidates).toContain(join(dir, 'dist', 'index.d.ts'));
  });

  it('resolves a subpath export (`pkg/sub`)', async () => {
    const dir = await writePkg('@scope/multi', {
      name: '@scope/multi',
      exports: { './client': { import: { types: './dist/client.d.ts' } } },
    });
    const candidates = resolveBarePackageTypes('@scope/multi/client', fromFile);
    expect(candidates).toContain(join(dir, 'dist', 'client.d.ts'));
  });

  it('still offers conventional fallbacks when package.json has no type fields', async () => {
    const dir = await writePkg('barebones', { name: 'barebones' });
    const candidates = resolveBarePackageTypes('barebones', fromFile);
    expect(candidates).toContain(join(dir, 'index.d.ts'));
    expect(candidates).toContain(join(dir, 'dist', 'index.d.ts'));
  });

  it('returns [] for an unresolvable package', () => {
    expect(resolveBarePackageTypes('@nope/not-installed-xyz', fromFile)).toEqual([]);
  });
});
