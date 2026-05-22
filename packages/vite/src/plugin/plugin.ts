import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';

const require = createRequire(import.meta.url);

export interface NestInertiaPluginOptions {
  ssr?: boolean;
  react?: boolean;
  vue?: boolean;
  svelte?: boolean;
  /**
   * When `true`, the nestInertia plugin will skip auto-loading the framework
   * Vite plugin. Use this when the framework plugin (e.g. @sveltejs/vite-plugin-svelte)
   * needs to be added manually in the vite config alongside nestInertia().
   *
   * @default false
   */
  skipFrameworkPlugin?: boolean;
  clientEntry?: string;
  ssrEntry?: string;
  alias?: Record<string, string>;
  root?: string;
  entry?: string;
}

export class InvalidViteConfigException extends Error {
  constructor(message: string) {
    super(`[nestjs-inertia-vite] ${message}`);
    this.name = 'InvalidViteConfigException';
  }
}

function loadFrameworkPlugin(framework: 'react' | 'vue' | 'svelte'): Plugin {
  const pkg =
    framework === 'react'
      ? '@vitejs/plugin-react'
      : framework === 'vue'
        ? '@vitejs/plugin-vue'
        : '@sveltejs/vite-plugin-svelte';
  try {
    const mod = require(pkg) as { default?: () => Plugin; svelte?: () => Plugin };
    // @sveltejs/vite-plugin-svelte v3+ exports a named `svelte` export rather than default
    const factory = mod.default ?? (framework === 'svelte' ? mod.svelte : undefined) ?? (mod as unknown as () => Plugin);
    return (factory as () => Plugin)();
  } catch {
    throw new InvalidViteConfigException(`Plugin "${pkg}" not installed. Run: pnpm add ${pkg}`);
  }
}

export default function nestInertia(options: NestInertiaPluginOptions = {}): Plugin[] {
  const frameworkFlags = [options.react, options.vue, options.svelte].filter(Boolean);
  if (frameworkFlags.length !== 1) {
    throw new InvalidViteConfigException(
      'nestInertia requires exactly one framework flag: react, vue, or svelte',
    );
  }

  const defaultRoot = 'inertia';
  const alias = {
    '@': resolve(process.cwd(), options.root ?? defaultRoot),
    ...(options.alias ?? {}),
  };

  const configurer: Plugin = {
    name: 'nestjs-inertia',
    config: (userConfig: UserConfig): Omit<UserConfig, 'plugins'> => {
      const resolvedRoot = options.root ?? defaultRoot;
      const defaultEntry = options.entry ?? options.clientEntry ?? `${resolvedRoot}/app/client.tsx`;

      const buildConfig: NonNullable<UserConfig['build']> = {
        manifest: true,
        rollupOptions: {},
      };

      // Only set outDir if the user hasn't already defined it
      if (!userConfig.build?.outDir) {
        buildConfig.outDir = 'dist/inertia/client';
      }

      // Only set rollupOptions.input if the user hasn't already defined it
      if (!userConfig.build?.rollupOptions?.input) {
        buildConfig.rollupOptions = {
          input: resolve(process.cwd(), defaultEntry),
        };
      }

      const result: Omit<UserConfig, 'plugins'> = {
        build: buildConfig,
        resolve: { alias },
        server: {
          middlewareMode: true,
          hmr: { port: 24679 },
        },
      };

      // Only set root if the user hasn't already defined it in their vite config
      if (!userConfig.root) {
        result.root = resolve(process.cwd(), resolvedRoot);
      }

      return result;
    },
  };

  if (options.skipFrameworkPlugin) {
    return [configurer];
  }

  const frameworkPlugin = options.react
    ? loadFrameworkPlugin('react')
    : options.vue
      ? loadFrameworkPlugin('vue')
      : loadFrameworkPlugin('svelte');

  return [configurer, frameworkPlugin];
}
