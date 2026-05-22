import type { InertiaModuleOptions } from '../types.js';

const ALLOWED = new Set(['PUT', 'PATCH', 'DELETE']);

interface FastifyHookApp {
  addHook: (event: string, handler: (req: unknown, reply: unknown) => Promise<void> | void) => void;
}

export function registerFastifyMethodSpoof(app: FastifyHookApp, options: InertiaModuleOptions): void {
  if (options.methodSpoofing === false) return;
  app.addHook('preHandler', async (req: unknown) => {
    const r = req as { method: string; headers: Record<string, string>; body?: { _method?: unknown } };
    if (r.method !== 'POST') return;
    const contentType = (r.headers['content-type'] ?? '').toString().toLowerCase();
    if (!contentType.startsWith('multipart/')) return;
    const spoofed = String(r.body?._method ?? '').toUpperCase();
    if (ALLOWED.has(spoofed)) {
      (r as { method: string }).method = spoofed;
      if (r.body && typeof r.body === 'object') {
        delete r.body._method;
      }
    }
  });
}
