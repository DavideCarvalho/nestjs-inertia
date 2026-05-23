import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateCsrfToken(secret: string): string {
  const raw = randomBytes(32).toString('base64url');
  const sig = createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Constant-time buffer comparison that returns `false` for length mismatches
 * rather than throwing, avoiding a timing oracle on length.
 */
export function timingSafeEqualSafe(a: Buffer, b: Buffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

export function verifyCsrfToken(token: string, secret: string): boolean {
  if (typeof token !== 'string') return false;
  // Require exactly one dot — reject tokens like "raw.sig.junk"
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;
  const raw = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  // Reject if there is a second dot (multi-part tokens)
  if (sig.includes('.')) return false;
  if (!raw || !sig) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64url');
  return timingSafeEqualSafe(Buffer.from(sig), Buffer.from(expected));
}
