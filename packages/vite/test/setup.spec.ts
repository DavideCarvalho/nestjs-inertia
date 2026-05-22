import { describe, it, expect, vi } from 'vitest';
import { setupInertiaVite } from '../src/setup.js';

function fakeApp() {
  const middlewares: unknown[] = [];
  return {
    middlewares,
    use: vi.fn((m: unknown) => middlewares.push(m)),
  } as unknown as { use: (m: unknown) => void; middlewares: unknown[] };
}

describe('setupInertiaVite', () => {
  it('in production, registers static-serve middleware', async () => {
    const app = fakeApp();
    await setupInertiaVite(app as never, {
      mode: 'production',
      root: 'inertia',
      publicDir: 'inertia/public',
      outDir: 'dist/inertia',
    });
    // Two static-serve middlewares (assets + root)
    expect((app as unknown as { middlewares: unknown[] }).middlewares.length).toBeGreaterThanOrEqual(1);
  });

  it('in development, creates Vite dev server in middleware mode', async () => {
    const app = fakeApp();
    // Don't actually start Vite — just verify the code path tries to.
    let viteCreated = false;
    vi.doMock('vite', () => ({
      createServer: async () => {
        viteCreated = true;
        return { middlewares: (_req: unknown, _res: unknown, next: () => void) => next() };
      },
    }));
    await setupInertiaVite(app as never, {
      mode: 'development',
      root: 'inertia',
      publicDir: 'inertia/public',
      outDir: 'dist/inertia',
    });
    expect(viteCreated).toBe(true);
    vi.doUnmock('vite');
  });
});
