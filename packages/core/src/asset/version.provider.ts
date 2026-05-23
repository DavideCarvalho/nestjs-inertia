import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Provider } from '@nestjs/common';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

export interface ManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}
export type Manifest = Record<string, ManifestEntry>;

const DEFAULT_MANIFEST_PATH = 'dist/inertia/client/.vite/manifest.json';

/**
 * Validates that a parsed manifest has the expected Vite manifest shape.
 * Each entry must be a non-null object with a string `file` property.
 * Throws with a clear error if any entry is malformed.
 */
function assertManifestShape(parsed: unknown, path: string): Manifest {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Vite manifest at ${path} has unexpected shape: expected a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
    );
  }
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(
        `Vite manifest at ${path} has unexpected shape: entry "${key}" is not an object`,
      );
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.file !== 'string') {
      throw new Error(
        `Vite manifest at ${path} has unexpected shape: entry "${key}" is missing required string field "file"`,
      );
    }
  }
  return parsed as Manifest;
}

export function loadManifest(path: string): Manifest | null {
  try {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
    const raw = readFileSync(abs, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return assertManifestShape(parsed, abs);
  } catch (err) {
    // Propagate shape validation errors — they indicate a misconfigured build
    if (err instanceof Error && err.message.includes('Vite manifest at')) {
      throw err;
    }
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
  useFactory: async (manifest: Manifest | null, opts: InertiaModuleOptions): Promise<string> => {
    if (opts.version !== undefined) {
      return typeof opts.version === 'function' ? await opts.version() : opts.version;
    }
    return computeAssetVersion(manifest);
  },
};
