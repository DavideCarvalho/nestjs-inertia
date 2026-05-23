export const INERTIA_MODULE_OPTIONS = Symbol('INERTIA_MODULE_OPTIONS');
export const INERTIA_FEATURE_OPTIONS = Symbol('INERTIA_FEATURE_OPTIONS');
export const INERTIA_MANIFEST = Symbol('INERTIA_MANIFEST');
export const INERTIA_ASSET_VERSION = Symbol('INERTIA_ASSET_VERSION');
export const INERTIA_DEFAULT_SCOPE = 'default';

export type InertiaScope = string;

const RESERVED_SCOPES = new Set(['default']);

/**
 * Module-local symbol cache. Keys are `${kind}:${scope}` strings.
 * Using a module-local Map instead of Symbol.for() prevents external
 * code that knows the string key from hijacking the symbol, and avoids
 * collisions with other packages that might use the same global registry key.
 *
 * For multi-root apps where scope names must be unique across roots, pass
 * a `rootId` to `featureToken(kind, scope, rootId)` to guarantee isolation.
 */
const _featureTokenCache = new Map<string, symbol>();

export function featureToken(
  kind: 'OPTIONS' | 'MANIFEST' | 'ASSET_VERSION' | 'SHELL_RENDERER' | 'SSR_LOADER',
  scope: string,
  rootId?: string,
): symbol {
  const key = rootId ? `${kind}:${scope}:${rootId}` : `${kind}:${scope}`;
  const cached = _featureTokenCache.get(key);
  if (cached) return cached;
  const sym = Symbol(`INERTIA_FEATURE_${kind}:${scope}${rootId ? `:${rootId}` : ''}`);
  _featureTokenCache.set(key, sym);
  return sym;
}

export function assertScopeNotReserved(scope: string): void {
  if (RESERVED_SCOPES.has(scope)) {
    throw new Error(
      `[nestjs-inertia] Scope "${scope}" is reserved. Use forRoot() for the default scope.`,
    );
  }
}
