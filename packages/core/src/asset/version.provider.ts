import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Logger, type Provider } from '@nestjs/common';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

const versionLogger = new Logger('InertiaAssetVersion');

/** Whether the unstable random-fallback warning has already been emitted. */
let _randomFallbackWarned = false;

/** @internal — resets the one-time random-fallback warning flag (for tests only) */
export function _resetRandomFallbackWarning(): void {
  _randomFallbackWarned = false;
}

/**
 * Reads the application's `package.json` version from `cwd`, if present.
 * Returns `null` when the file is missing, unreadable, or lacks a string `version`.
 */
function readPackageVersion(): string | null {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a STABLE asset version when no Vite manifest is available.
 *
 * Order of preference (most-to-least explicit):
 *   1. `INERTIA_ASSET_VERSION` env var — explicit build id / deploy hash.
 *   2. The app's `package.json` `version` — stable across restarts within a release.
 *
 * Both are hashed (sha1, 32 hex) so the wire format matches the manifest branch.
 * Returns `null` when neither source is available so the caller can fall back to
 * the (unstable) random value as a last resort.
 */
export function resolveStableFallbackVersion(): string | null {
  const buildId = process.env.INERTIA_ASSET_VERSION;
  if (buildId !== undefined && buildId.length > 0) {
    return createHash('sha1').update(buildId).digest('hex').slice(0, 32);
  }
  const pkgVersion = readPackageVersion();
  if (pkgVersion !== null) {
    return createHash('sha1').update(`pkg:${pkgVersion}`).digest('hex').slice(0, 32);
  }
  return null;
}

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
  // No manifest: prefer a STABLE fallback (build-id env var or package.json
  // version) so the asset version does not change on every boot/deploy in
  // clustered setups (which would force a full page reload each restart).
  const stable = resolveStableFallbackVersion();
  if (stable !== null) {
    return stable;
  }
  // Last resort only: no stable source available. Random changes every boot —
  // warn once so operators can configure INERTIA_ASSET_VERSION.
  if (!_randomFallbackWarned) {
    _randomFallbackWarned = true;
    versionLogger.warn(
      'No Vite manifest, INERTIA_ASSET_VERSION env var, or package.json version found; ' +
        'falling back to a random asset version that changes on every restart. ' +
        'Set INERTIA_ASSET_VERSION (or `version` in module options) for stable cache-busting across deploys.',
    );
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
