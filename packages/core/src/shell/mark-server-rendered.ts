/**
 * Ensure the Inertia `#app` mount element in a server-rendered body carries the
 * `data-server-rendered="true"` attribute, which the Inertia client uses to
 * decide between hydration (SSR) and a fresh client render (CSR).
 *
 * The attribute is inserted immediately after the `id="app"` (or `id='app'`)
 * attribute of the first matching element. The operation is idempotent: a body
 * that already declares `data-server-rendered` on that element is returned
 * unchanged, and a body without an `#app` mount is left untouched.
 */
const APP_ID = /\bid=(["'])app\1/;

export function markServerRendered(body: string): string {
  const match = APP_ID.exec(body);
  if (!match) return body;

  // Already marked on the mount element's opening tag — leave it alone.
  const tagEnd = body.indexOf('>', match.index);
  const openTag = tagEnd === -1 ? body.slice(match.index) : body.slice(match.index, tagEnd);
  if (openTag.includes('data-server-rendered')) return body;

  const insertAt = match.index + match[0].length;
  return `${body.slice(0, insertAt)} data-server-rendered="true"${body.slice(insertAt)}`;
}
