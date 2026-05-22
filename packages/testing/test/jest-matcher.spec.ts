import { describe, it, expect } from 'vitest';

describe('jest.ts module loads', () => {
  it('importing jest matchers does not throw', async () => {
    await import('../src/jest.js');
    // Matchers are registered on globalThis.expect; if we got here, the file loaded.
    expect(true).toBe(true);
  });
});
