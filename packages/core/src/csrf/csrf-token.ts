import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generates a CSRF token.
 *
 * @param secret     The HMAC secret.
 * @param context    Optional session-bound context value (e.g. session ID or nonce).
 *                   When provided, the context is included in the HMAC payload so that
 *                   tokens become invalid when the context changes (e.g. after a session
 *                   principal change). Token format: `<raw>.<context-hex>.<sig>`
 *                   Without context, format is: `<raw>.<sig>`
 */
export function generateCsrfToken(secret: string, context?: string): string {
  const raw = randomBytes(32).toString('base64url');
  if (context !== undefined && context !== '') {
    const ctx = Buffer.from(context).toString('hex');
    const sig = createHmac('sha256', secret).update(`${raw}:${context}`).digest('base64url');
    return `${raw}.${ctx}.${sig}`;
  }
  const sig = createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Constant-time buffer comparison that returns `false` for length mismatches
 * rather than throwing, avoiding a timing oracle on length.
 */
export function timingSafeEqualSafe(a: Buffer, b: Buffer): boolean {
  const maxLen = Math.max(a.byteLength, b.byteLength);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  a.copy(aPadded);
  b.copy(bPadded);
  return timingSafeEqual(aPadded, bPadded) && a.byteLength === b.byteLength;
}

/**
 * Verifies a CSRF token.
 *
 * @param token    The token string (from cookie or header).
 * @param secret   The HMAC secret.
 * @param context  Optional session-bound context value. Must match the context
 *                 used when the token was generated. If the context has changed
 *                 (e.g. new session), the old token will fail verification.
 */
export function verifyCsrfToken(token: string, secret: string, context?: string): boolean {
  if (typeof token !== 'string') return false;

  const parts = token.split('.');

  // Token with context: raw.ctx-hex.sig (exactly 3 parts)
  if (parts.length === 3) {
    const [raw, ctxHex, sig] = parts;
    if (!raw || !ctxHex || !sig) return false;
    // Decode the stored context from hex
    let storedContext: string;
    try {
      storedContext = Buffer.from(ctxHex, 'hex').toString();
    } catch {
      return false;
    }
    // If caller supplies a context, it must match the stored context
    if (context !== undefined && context !== '' && storedContext !== context) return false;
    // If no context supplied by caller, we still verify using the stored context
    const expectedContext = context !== undefined && context !== '' ? context : storedContext;
    const expected = createHmac('sha256', secret)
      .update(`${raw}:${expectedContext}`)
      .digest('base64url');
    return timingSafeEqualSafe(Buffer.from(sig), Buffer.from(expected));
  }

  // Token without context: raw.sig (exactly 2 parts, no further dots)
  if (parts.length === 2) {
    const [raw, sig] = parts;
    if (!raw || !sig) return false;
    // If context is expected but token has no context part, reject
    if (context !== undefined && context !== '') return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    return timingSafeEqualSafe(Buffer.from(sig), Buffer.from(expected));
  }

  return false;
}
