import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { type Provider } from '@nestjs/common';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

export interface ManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}
export type Manifest = Record<string, ManifestEntry>;

const DEFAULT_MANIFEST_PATH = 'dist/inertia/client/.vite/manifest.json';

export function loadManifest(path: string): Manifest | null {
  try {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
    const raw = readFileSync(abs, 'utf8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

export function computeAssetVersion(manifest: Manifest | null): string {
  if (manifest) {
    return createHash('sha1').update(JSON.stringify(manifest)).digest('hex').slice(0, 32);
  }
  return randomUUID().replace(/-/g, '');
}

export const manifestProvider: Provider = {
  provide: INERTIA_MANIFEST,
  inject: [INERTIA_MODULE_OPTIONS],
  useFactory: (opts: InertiaModuleOptions): Manifest | null => {
    if (process.env.NODE_ENV !== 'production') return null;
    const path = opts.vite?.manifestPath ?? DEFAULT_MANIFEST_PATH;
    return loadManifest(path);
  },
};

export const assetVersionProvider: Provider = {
  provide: INERTIA_ASSET_VERSION,
  inject: [INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS],
  useFactory: async (
    manifest: Manifest | null,
    opts: InertiaModuleOptions,
  ): Promise<string> => {
    if (opts.version !== undefined) {
      return typeof opts.version === 'function' ? await opts.version() : opts.version;
    }
    return computeAssetVersion(manifest);
  },
};
