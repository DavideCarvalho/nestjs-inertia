import { describe, expect, it } from 'vitest';
import {
  INERTIA_ASSET_VERSION,
  INERTIA_DEFAULT_SCOPE,
  INERTIA_FEATURE_OPTIONS,
  INERTIA_MANIFEST,
  INERTIA_MODULE_OPTIONS,
  featureToken,
} from '../src/tokens.js';

describe('tokens', () => {
  it('exposes unique Symbols', () => {
    const all = [
      INERTIA_MODULE_OPTIONS,
      INERTIA_FEATURE_OPTIONS,
      INERTIA_MANIFEST,
      INERTIA_ASSET_VERSION,
    ];
    const set = new Set(all);
    expect(set.size).toBe(all.length);
    for (const t of all) expect(typeof t).toBe('symbol');
  });

  it('default scope is the string "default"', () => {
    expect(INERTIA_DEFAULT_SCOPE).toBe('default');
  });

  // S-4: featureToken uses module-local symbol cache (no Symbol.for collisions)
  describe('S-4: featureToken module-local cache', () => {
    it('two featureToken("admin") calls return the same symbol', () => {
      const a = featureToken('OPTIONS', 'admin');
      const b = featureToken('OPTIONS', 'admin');
      expect(a).toBe(b);
    });

    it('is NOT in the global Symbol registry (not Symbol.for)', () => {
      const sym = featureToken('OPTIONS', 'admin');
      const globalSym = Symbol.for('INERTIA_FEATURE_OPTIONS:admin');
      expect(sym).not.toBe(globalSym);
    });

    it('different scopes produce different symbols', () => {
      const a = featureToken('OPTIONS', 'scope-a');
      const b = featureToken('OPTIONS', 'scope-b');
      expect(a).not.toBe(b);
    });

    it('different kinds produce different symbols for the same scope', () => {
      const opts = featureToken('OPTIONS', 'myscope');
      const manifest = featureToken('MANIFEST', 'myscope');
      expect(opts).not.toBe(manifest);
    });

    it('rootId suffix isolates symbols between roots', () => {
      const root1 = featureToken('OPTIONS', 'admin', 'root-1');
      const root2 = featureToken('OPTIONS', 'admin', 'root-2');
      expect(root1).not.toBe(root2);
    });
  });
});
