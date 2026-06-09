/**
 * Reads a request header in a cross-runtime way.
 *
 * Works for both Express (`req.header(name)`) and raw Fastify
 * (`req.headers[name.toLowerCase()]`). Array header values resolve to the
 * first element.
 */
export function getHeader(req: unknown, name: string): string | undefined {
  const r = req as {
    header?: (n: string) => string | undefined;
    headers?: Record<string, string | string[] | undefined>;
  };
  if (typeof r.header === 'function') return r.header(name);
  const v = r.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
