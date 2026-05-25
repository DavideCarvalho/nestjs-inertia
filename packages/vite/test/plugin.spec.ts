import { resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import nestInertia, { InvalidViteConfigException } from '../src/plugin/plugin.js';

type ConfigurerPlugin = Plugin & {
  config: (userConfig: UserConfig) => unknown;
};

type ConfigureServerPlugin = Plugin & {
  configureServer: (server: unknown) => void;
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

  it('does not overwrite build.outDir when user has already set it in vite config', () => {
    const plugins = nestInertia({ react: true });
    const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
      | ConfigurerPlugin
      | undefined;
    expect(configurer).toBeDefined();
    const config = configurer!.config({
      build: { outDir: '/my/custom/out' },
    }) as { build: { outDir?: string } };
    // Plugin should NOT set outDir when user already defined it
    expect(config.build.outDir).toBeUndefined();
  });

  describe('skipFrameworkPlugin option', () => {
    it('returns only configurer and codegenHmr when skipFrameworkPlugin is true', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      expect(plugins).toHaveLength(2);
      expect(plugins[0].name).toBe('nestjs-inertia');
      expect(plugins[1].name).toBe('nestjs-inertia:codegen-hmr');
    });

    it('returns configurer, framework plugin, and codegenHmr when skipFrameworkPlugin is false', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: false });
      expect(plugins).toHaveLength(3);
      expect(plugins[0].name).toBe('nestjs-inertia');
      // plugins[1] is the framework plugin (react)
      expect(plugins[2].name).toBe('nestjs-inertia:codegen-hmr');
    });
  });

  describe('framework plugin selection', () => {
    it('loads vue framework plugin when vue flag is set', () => {
      const plugins = nestInertia({ vue: true });
      expect(plugins).toHaveLength(3);
      const names = plugins.map((p) => p.name);
      expect(names).toContain('nestjs-inertia');
      expect(names).toContain('nestjs-inertia:codegen-hmr');
      // The middle plugin should be the vue plugin
      expect(plugins[1].name).not.toBe('nestjs-inertia');
      expect(plugins[1].name).not.toBe('nestjs-inertia:codegen-hmr');
    });

    it('loads svelte framework plugin when svelte flag is set', () => {
      const plugins = nestInertia({ svelte: true });
      expect(plugins).toHaveLength(3);
      const names = plugins.map((p) => p.name);
      expect(names).toContain('nestjs-inertia');
      expect(names).toContain('nestjs-inertia:codegen-hmr');
      // The middle plugin should be the svelte plugin
      expect(plugins[1].name).not.toBe('nestjs-inertia');
      expect(plugins[1].name).not.toBe('nestjs-inertia:codegen-hmr');
    });
  });

  describe('InvalidViteConfigException', () => {
    it('has the correct name property', () => {
      const err = new InvalidViteConfigException('test message');
      expect(err.name).toBe('InvalidViteConfigException');
      expect(err.message).toBe('[nestjs-inertia-vite] test message');
    });
  });

  describe('configureServer (codegen HMR)', () => {
    function createMockServer() {
      const changeHandlers: Array<(file: string) => void> = [];
      const modules = new Map<string, Set<{ id: string }>>();
      const invalidated: Array<{ id: string }> = [];
      const wsSent: Array<unknown> = [];

      return {
        server: {
          watcher: {
            add: vi.fn(),
            on: vi.fn((event: string, handler: (file: string) => void) => {
              if (event === 'change') {
                changeHandlers.push(handler);
              }
            }),
          },
          moduleGraph: {
            getModulesByFile: vi.fn((file: string) => modules.get(file) ?? null),
            invalidateModule: vi.fn((mod: { id: string }) => invalidated.push(mod)),
          },
          ws: {
            send: vi.fn((msg: unknown) => wsSent.push(msg)),
          },
        },
        changeHandlers,
        modules,
        invalidated,
        wsSent,
      };
    }

    it('adds the codegen directory to the watcher', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;
      expect(hmrPlugin).toBeDefined();

      const { server } = createMockServer();
      hmrPlugin!.configureServer(server);

      const expectedDir = resolve(process.cwd(), '.nestjs-inertia');
      expect(server.watcher.add).toHaveBeenCalledWith(expectedDir);
    });

    it('registers a change handler on the watcher', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;

      const { server } = createMockServer();
      hmrPlugin!.configureServer(server);

      expect(server.watcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('ignores changes outside the codegen directory', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;

      const mock = createMockServer();
      hmrPlugin!.configureServer(mock.server);

      // Trigger change for a file outside the codegen dir
      mock.changeHandlers[0]('/some/other/file.ts');

      expect(mock.server.moduleGraph.getModulesByFile).not.toHaveBeenCalled();
      expect(mock.server.ws.send).not.toHaveBeenCalled();
    });

    it('sends full-reload for files inside the codegen directory', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;

      const mock = createMockServer();
      hmrPlugin!.configureServer(mock.server);

      const codegenDir = resolve(process.cwd(), '.nestjs-inertia');
      const changedFile = `${codegenDir}/generated-types.ts`;

      mock.changeHandlers[0](changedFile);

      expect(mock.server.moduleGraph.getModulesByFile).toHaveBeenCalledWith(changedFile);
      expect(mock.server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });
    });

    it('invalidates modules when they exist in the module graph', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;

      const mock = createMockServer();
      hmrPlugin!.configureServer(mock.server);

      const codegenDir = resolve(process.cwd(), '.nestjs-inertia');
      const changedFile = `${codegenDir}/generated-types.ts`;

      // Register modules for this file
      const mod1 = { id: 'mod1' };
      const mod2 = { id: 'mod2' };
      mock.modules.set(changedFile, new Set([mod1, mod2]));

      mock.changeHandlers[0](changedFile);

      expect(mock.server.moduleGraph.invalidateModule).toHaveBeenCalledTimes(2);
      expect(mock.server.moduleGraph.invalidateModule).toHaveBeenCalledWith(mod1);
      expect(mock.server.moduleGraph.invalidateModule).toHaveBeenCalledWith(mod2);
      expect(mock.server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });
    });

    it('does not call invalidateModule when no modules exist for the file', () => {
      const plugins = nestInertia({ react: true, skipFrameworkPlugin: true });
      const hmrPlugin = plugins.find((p) => p.name === 'nestjs-inertia:codegen-hmr') as
        | ConfigureServerPlugin
        | undefined;

      const mock = createMockServer();
      hmrPlugin!.configureServer(mock.server);

      const codegenDir = resolve(process.cwd(), '.nestjs-inertia');
      const changedFile = `${codegenDir}/generated-types.ts`;

      // No modules registered — getModulesByFile returns null
      mock.changeHandlers[0](changedFile);

      expect(mock.server.moduleGraph.invalidateModule).not.toHaveBeenCalled();
      // But full-reload should still be sent
      expect(mock.server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });
    });
  });

  describe('config hook with custom options', () => {
    it('uses custom root option for alias and build paths', () => {
      const plugins = nestInertia({ react: true, root: 'custom-root', skipFrameworkPlugin: true });
      const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
        | ConfigurerPlugin
        | undefined;
      const config = configurer!.config({}) as {
        root: string;
        resolve: { alias: Record<string, string> };
      };
      expect(config.root).toBe(resolve(process.cwd(), 'custom-root'));
      expect(config.resolve.alias['@']).toBe(resolve(process.cwd(), 'custom-root'));
    });

    it('uses custom entry option', () => {
      const plugins = nestInertia({
        react: true,
        entry: 'custom/entry.tsx',
        skipFrameworkPlugin: true,
      });
      const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
        | ConfigurerPlugin
        | undefined;
      const config = configurer!.config({}) as {
        build: { rollupOptions: { input: string } };
      };
      expect(config.build.rollupOptions.input).toBe(resolve(process.cwd(), 'custom/entry.tsx'));
    });

    it('uses clientEntry option when entry is not set', () => {
      const plugins = nestInertia({
        react: true,
        clientEntry: 'my-client.tsx',
        skipFrameworkPlugin: true,
      });
      const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
        | ConfigurerPlugin
        | undefined;
      const config = configurer!.config({}) as {
        build: { rollupOptions: { input: string } };
      };
      expect(config.build.rollupOptions.input).toBe(resolve(process.cwd(), 'my-client.tsx'));
    });

    it('merges custom alias options', () => {
      const plugins = nestInertia({
        react: true,
        alias: { '~': '/custom/path' },
        skipFrameworkPlugin: true,
      });
      const configurer = plugins.find((p) => p.name === 'nestjs-inertia') as
        | ConfigurerPlugin
        | undefined;
      const config = configurer!.config({}) as {
        resolve: { alias: Record<string, string> };
      };
      expect(config.resolve.alias['~']).toBe('/custom/path');
      expect(config.resolve.alias['@']).toBeDefined();
    });
  });
});
