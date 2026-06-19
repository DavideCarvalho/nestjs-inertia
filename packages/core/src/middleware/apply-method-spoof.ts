/** The HTTP methods a multipart POST may spoof via a `_method` field. */
const ALLOWED = new Set(['PUT', 'PATCH', 'DELETE']);

/** The minimal request shape the method-spoof rewrite needs (Express + Fastify). */
export interface SpoofableRequest {
  method: string;
  headers: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * Rewrite `req.method` from a `_method` body field when this is a multipart POST
 * carrying a valid override (PUT/PATCH/DELETE), then clear `_method`. No-op for
 * anything else. Shared by the Express middleware and the Fastify preHandler hook
 * so the spoofing rule lives in one place. Callers gate on `methodSpoofing` first.
 */
export function applyMethodSpoof(req: SpoofableRequest): void {
  if (req.method !== 'POST') return;
  const contentType = (req.headers['content-type'] ?? '').toString().toLowerCase();
  if (!contentType.startsWith('multipart/')) return;
  const spoofed = String(req.body?._method ?? '').toUpperCase();
  if (!ALLOWED.has(spoofed)) return;
  req.method = spoofed;
  if (req.body && typeof req.body === 'object') {
    req.body._method = undefined;
  }
}
