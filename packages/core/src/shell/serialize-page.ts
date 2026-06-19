/**
 * Serialize a page object for safe inclusion inside a <script type="application/json"> tag.
 * Escapes characters that could break out of the script element:
 *   - `<`     -> \u003c (prevents `</script>` injection)
 *   - `>`     -> \u003e (defense in depth)
 *   - `&`     -> \u0026 (HTML entity context)
 *   - U+2028  -> \u2028 (legacy JS string terminators)
 *   - U+2029  -> \u2029 (legacy JS string terminators)
 */

const LS = '\u2028';
const PS = '\u2029';
// Build the regex using a RegExp constructor so esbuild handles it fine across encodings
const UNSAFE_CHARS = new RegExp(`[<>&/${LS}${PS}]`, 'g');

export function serializePageData(page: unknown): string {
  return JSON.stringify(page).replace(UNSAFE_CHARS, (c: string) => {
    switch (c) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '/':
        return '\\/';
      case LS:
        return '\\u2028';
      case PS:
        return '\\u2029';
      default:
        return c;
    }
  });
}
