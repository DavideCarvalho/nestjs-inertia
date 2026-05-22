import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateCsrfToken(secret: string): string {
  const raw = randomBytes(32).toString('base64url');
  const sig = createHmac('sha256', secret).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

export function verifyCsrfToken(token: string, secret: string): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [raw, sig] = token.split('.', 2);
  if (!raw || !sig) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('base64url');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
