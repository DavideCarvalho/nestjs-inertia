import type { Props } from '../types.js';

/**
 * Recursively convert `undefined` to `null` for wire serialization.
 *
 * Allocation-avoidance fast path: a new container is only allocated when a
 * replacement is actually required at that level (an `undefined` value, or a
 * nested object/array that itself changed). When nothing changes, the original
 * object/array reference is returned unchanged. Output semantics are identical
 * to a full deep-clone that maps every `undefined` to `null`.
 */
export function nullifyUndefined(props: Props): Props {
  let out: Props | null = null;
  for (const [k, v] of Object.entries(props)) {
    let replacement: unknown;
    let changed = false;
    if (v === undefined) {
      replacement = null;
      changed = true;
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      replacement = nullifyUndefined(v as Props);
      changed = replacement !== v;
    } else if (Array.isArray(v)) {
      replacement = nullifyArray(v);
      changed = replacement !== v;
    } else {
      replacement = v;
    }

    if (changed && out === null) {
      // First change at this level: clone keys seen so far.
      out = { ...props };
    }
    if (out !== null) {
      out[k] = replacement;
    }
  }
  return out ?? props;
}

function nullifyArray(arr: unknown[]): unknown[] {
  let out: unknown[] | null = null;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    let replacement: unknown;
    let changed = false;
    if (item === undefined) {
      replacement = null;
      changed = true;
    } else if (typeof item === 'object' && item !== null) {
      replacement = nullifyUndefined(item as Props);
      changed = replacement !== item;
    } else {
      replacement = item;
    }

    if (changed && out === null) {
      out = arr.slice();
    }
    if (out !== null) {
      out[i] = replacement;
    }
  }
  return out ?? arr;
}
