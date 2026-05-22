import type { Plugin, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import nestInertia from '../src/plugin/plugin.js';

type ConfigurerPlugin = Plugin & {
  config: (userConfig: UserConfig) => unknown;
};

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
    const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
      | ConfigurerPlugin
      | undefined;
    expect(configurer).toBeDefined();
    const config = configurer!.config({});
    expect(config).toMatchObject({
      build: { manifest: true, outDir: 'dist/inertia/client' },
      resolve: { alias: expect.any(Object) },
    });
  });

  it('does not overwrite root when user has already set it in vite config', () => {
    const plugins = nestInertia({ react: true });
    const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
      | ConfigurerPlugin
      | undefined;
    expect(configurer).toBeDefined();
    // Simulate user having set root in their vite config
    const config = configurer!.config({ root: '/my/custom/root' }) as Record<string, unknown>;
    // Plugin should NOT set root when user already defined it
    expect(config.root).toBeUndefined();
  });

  it('does not overwrite build.rollupOptions.input when user has already set it in vite config', () => {
    const plugins = nestInertia({ react: true });
    const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
      | ConfigurerPlugin
      | undefined;
    expect(configurer).toBeDefined();
    // Simulate user having set rollupOptions.input in their vite config
    const config = configurer!.config({
      build: { rollupOptions: { input: '/my/custom/entry.tsx' } },
    }) as { build: { rollupOptions: { input?: unknown } } };
    // Plugin should NOT set input when user already defined it
    expect(config.build.rollupOptions.input).toBeUndefined();
  });
});
