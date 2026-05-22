export const INERTIA_MODULE_OPTIONS = Symbol('INERTIA_MODULE_OPTIONS');
export const INERTIA_FEATURE_OPTIONS = Symbol('INERTIA_FEATURE_OPTIONS');
export const INERTIA_MANIFEST = Symbol('INERTIA_MANIFEST');
export const INERTIA_ASSET_VERSION = Symbol('INERTIA_ASSET_VERSION');
export const INERTIA_DEFAULT_SCOPE = 'default';

export type InertiaScope = string;

const RESERVED_SCOPES = new Set(['default']);

export function featureToken(
  kind: 'OPTIONS' | 'MANIFEST' | 'ASSET_VERSION' | 'SHELL_RENDERER' | 'SSR_LOADER',
  scope: string,
): symbol {
  return Symbol.for(`INERTIA_FEATURE_${kind}:${scope}`);
}

export function assertScopeNotReserved(scope: string): void {
  if (RESERVED_SCOPES.has(scope)) {
    throw new Error(`[nestjs-inertia] Scope "${scope}" is reserved. Use forRoot() for the default scope.`);
  }
}
