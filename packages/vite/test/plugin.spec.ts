import { describe, it, expect } from 'vitest';
import nestInertia from '../src/plugin/plugin.js';

describe('nestInertia plugin', () => {
  it('returns an array of Vite plugins', () => {
    const plugins = nestInertia({ react: true });
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('throws when two framework flags are set', () => {
    expect(() => nestInertia({ react: true, vue: true })).toThrow(/exactly one framework/i);
  });

  it('throws when no framework flag is set', () => {
    expect(() => nestInertia({})).toThrow(/exactly one framework/i);
  });

  it('sets manifest=true and outDir on the config plugin', () => {
    const plugins = nestInertia({ react: true });
    const configurer = plugins.find((p: { name?: string }) => p.name === 'nestjs-inertia');
    expect(configurer).toBeDefined();
    const config = (configurer as { config: () => unknown }).config();
    expect(config).toMatchObject({
      build: { manifest: true, outDir: 'dist/inertia/client' },
      resolve: { alias: expect.any(Object) },
    });
  });
});
