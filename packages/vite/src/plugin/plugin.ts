import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface NestInertiaPluginOptions {
  ssr?: boolean;
  react?: boolean;
  vue?: boolean;
  svelte?: boolean;
  clientEntry?: string;
  ssrEntry?: string;
  alias?: Record<string, string>;
  root?: string;
}

export class InvalidViteConfigException extends Error {
  constructor(message: string) {
    super(`[nestjs-inertia-vite] ${message}`);
    this.name = 'InvalidViteConfigException';
  }
}

interface VitePlugin {
  name: string;
  config?: () => unknown;
}

function loadFrameworkPlugin(framework: 'react' | 'vue' | 'svelte'): unknown {
  const pkg =
    framework === 'react'
      ? '@vitejs/plugin-react'
      : framework === 'vue'
        ? '@vitejs/plugin-vue'
        : '@sveltejs/vite-plugin-svelte';
  try {
    const mod = require(pkg) as { default?: () => unknown };
    const factory = mod.default ?? (mod as () => unknown);
    return (factory as () => unknown)();
  } catch {
    throw new InvalidViteConfigException(
      `Plugin "${pkg}" not installed. Run: pnpm add ${pkg}`,
    );
  }
}

export default function nestInertia(options: NestInertiaPluginOptions = {}): VitePlugin[] {
  const frameworkFlags = [options.react, options.vue, options.svelte].filter(Boolean);
  if (frameworkFlags.length !== 1) {
    throw new InvalidViteConfigException(
      'nestInertia requires exactly one framework flag: react, vue, or svelte',
    );
  }

  const root = options.root ?? 'inertia';
  const clientEntry = options.clientEntry ?? `${root}/app/client.tsx`;
  const alias = { '@': resolve(process.cwd(), root), ...(options.alias ?? {}) };

  const configurer: VitePlugin = {
    name: 'nestjs-inertia',
    config: () => ({
      root: resolve(process.cwd(), root),
      build: {
        manifest: true,
        outDir: 'dist/inertia/client',
        rollupOptions: {
          input: resolve(process.cwd(), clientEntry),
        },
      },
      resolve: { alias },
      server: {
        middlewareMode: true,
        hmr: { port: 24679 },
      },
    }),
  };

  const frameworkPlugin = options.react
    ? loadFrameworkPlugin('react')
    : options.vue
      ? loadFrameworkPlugin('vue')
      : loadFrameworkPlugin('svelte');

  return [configurer, frameworkPlugin as VitePlugin];
}
