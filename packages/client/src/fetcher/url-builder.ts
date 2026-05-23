export interface BuildUrlOptions {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * Build a URL from a path template, path params, query params, and an optional base URL.
 *
 * Examples:
 *   buildUrl('/users/:id', { params: { id: 42 } })                        → '/users/42'
 *   buildUrl('/users', { query: { active: true } })                        → '/users?active=true'
 *   buildUrl('/users', {}, 'https://api.test')                             → 'https://api.test/users'
 */
export function buildUrl(path: string, opts: BuildUrlOptions = {}, baseUrl?: string): string {
  // Interpolate path params — encodeURIComponent prevents path traversal
  // e.g. { id: '../admin' } → '/users/..%2Fadmin' not '/users/../admin'
  let resolved = path.replace(/:(\w+)/g, (_match, key: string) => {
    const val = opts.params?.[key];
    if (val === undefined || val === null) {
      throw new Error(`Missing param: ${key}`);
    }
    return encodeURIComponent(String(val));
  });

  // Build query string
  const qs = new URLSearchParams();
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) {
        qs.set(k, String(v));
      }
    }
  }
  const qsStr = qs.toString();
  if (qsStr) resolved += `?${qsStr}`;

  // Prepend base URL if provided
  if (baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return base + resolved;
  }
  return resolved;
}
