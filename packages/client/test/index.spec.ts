import { describe, expect, it } from 'vitest';

/**
 * Validates that the main entry of @dudousxd/nestjs-inertia-client
 * exports the expected public API.
 */
describe('main entry exports', () => {
  it('exports createFetcher as a function from the main entry', async () => {
    const mainEntry = await import('../src/index.js');
    expect(typeof mainEntry.createFetcher).toBe('function');
  });

  it('does not export setRouteResolver from the main entry (removed in favour of context providers)', async () => {
    const mainEntry = await import('../src/index.js');
    expect((mainEntry as Record<string, unknown>).setRouteResolver).toBeUndefined();
  });
});
