import { describe, it, expect } from 'vitest';
import {
  INERTIA_MODULE_OPTIONS,
  INERTIA_FEATURE_OPTIONS,
  INERTIA_MANIFEST,
  INERTIA_ASSET_VERSION,
  INERTIA_DEFAULT_SCOPE,
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
});
