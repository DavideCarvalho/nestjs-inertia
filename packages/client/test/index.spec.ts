import { describe, expect, it } from 'vitest';

/**
 * Validates that the main entry of @dudousxd/nestjs-inertia-client
 * exports setRouteResolver, as documented.
 */
describe('main entry exports', () => {
  it('exports setRouteResolver as a function from the main entry', async () => {
    const mainEntry = await import('../src/index.js');
    expect(typeof mainEntry.setRouteResolver).toBe('function');
  });
});
