// packages/codegen/src/discovery/route-name.ts
//
// Route-name derivation from controller class/method names and @As overrides,
// plus URL path joining. Pure string helpers extracted from contracts-fast.ts.

/**
 * Derive the route name from a controller class name and method name.
 * Strips the `Controller` suffix from the class name and lowercases the first letter.
 * e.g. `UsersController.list` → `users.list`
 */
export function deriveRouteName(className: string, methodName: string): string {
  const noSuffix = className.replace(/Controller$/, '');
  if (!noSuffix) {
    throw new Error(
      `Controller class name "${className}" derives empty route segment after stripping "Controller". Add an @As(...) override.`,
    );
  }
  const segment = noSuffix.charAt(0).toLowerCase() + noSuffix.slice(1);
  return `${segment}.${methodName}`;
}

/**
 * Derive just the class segment (no method) from a controller class name.
 * Strips the `Controller` suffix and lowercases the first letter.
 */
export function deriveClassSegment(className: string): string {
  const noSuffix = className.replace(/Controller$/, '');
  if (!noSuffix) {
    throw new Error(
      `Controller class name "${className}" derives empty route segment after stripping "Controller". Add an @As(...) override at the class level.`,
    );
  }
  return noSuffix.charAt(0).toLowerCase() + noSuffix.slice(1);
}

/**
 * Compose the final route name from class-level and method-level @As decorators.
 * Rule:
 *   classPortion  = class @As value  ?? deriveClassSegment(className)
 *   methodPortion = method @As value ?? methodName
 *   result        = `${classPortion}.${methodPortion}`
 */
export function resolveRouteName(
  className: string,
  methodName: string,
  classAs: string | undefined,
  methodAs: string | undefined,
): string {
  const classPortion = classAs ?? deriveClassSegment(className);
  const methodPortion = methodAs ?? methodName;
  return `${classPortion}.${methodPortion}`;
}

/** Join two URL path segments, normalising duplicate slashes. */
export function joinPaths(prefix: string, suffix: string): string {
  if (!prefix && !suffix) return '/';
  if (!prefix) return suffix.startsWith('/') ? suffix : `/${suffix}`;
  if (!suffix) return prefix.startsWith('/') ? prefix : `/${prefix}`;

  const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const combined = p + s;
  return combined === '' ? '/' : combined;
}
