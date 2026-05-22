import type { Props } from '../types.js';

export function nullifyUndefined(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = v === undefined ? null : v;
  }
  return out;
}
