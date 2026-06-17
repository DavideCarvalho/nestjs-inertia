import type { Props } from '../types.js';

/** Keys that, if used as property names, would allow prototype-pollution attacks. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function assertSafeKey(key: string): void {
  if (FORBIDDEN_KEYS.has(key)) {
    throw new Error(`[nestjs-inertia] Disallowed property key in nested path: "${key}"`);
  }
}

export function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    assertSafeKey(key);
    const existing = cur[key];
    if (existing === undefined) {
      cur[key] = {};
    } else if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      throw new Error(
        `[nestjs-inertia] dot-notation conflict at key "${path.slice(0, i + 1).join('.')}": expected object, got ${Array.isArray(existing) ? 'array' : typeof existing}`,
      );
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const finalKey = path[path.length - 1]!;
  assertSafeKey(finalKey);
  cur[finalKey] = value;
}

export function unpackDotKeys(props: Props): Props {
  // Fast path: nothing to unpack when no top-level key uses dot-notation.
  if (!Object.keys(props).some((k) => k.includes('.'))) return props;
  const out: Props = {};
  // First pass: detect non-dot keys that would conflict with parent paths
  const dotKeysParents = new Set<string>();
  for (const key of Object.keys(props)) {
    if (key.includes('.')) {
      dotKeysParents.add(key.split('.')[0]!);
    }
  }
  for (const parent of dotKeysParents) {
    if (
      props[parent] !== undefined &&
      (typeof props[parent] !== 'object' || props[parent] === null || Array.isArray(props[parent]))
    ) {
      throw new Error(
        `[nestjs-inertia] dot-notation conflict at key "${parent}": exists as scalar AND as parent of a dot key`,
      );
    }
  }
  // Second pass: write
  for (const [key, value] of Object.entries(props)) {
    if (key.includes('.')) {
      setNested(out, key.split('.'), value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
