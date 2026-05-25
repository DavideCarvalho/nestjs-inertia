import type { Props } from '../types.js';

export function nullifyUndefined(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) {
      out[k] = null;
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = nullifyUndefined(v as Props);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item === undefined
          ? null
          : typeof item === 'object' && item !== null
            ? nullifyUndefined(item as Props)
            : item,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}
