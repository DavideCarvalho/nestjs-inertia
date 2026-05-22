import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';

describe('package smoke', () => {
  it('exports VERSION constant', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
