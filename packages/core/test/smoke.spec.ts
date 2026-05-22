import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { VERSION } from '../src/index.js';

describe('package smoke', () => {
  it('exports VERSION constant', () => {
    expect(typeof VERSION).toBe('string');
  });

  it('VERSION matches package.json version', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
