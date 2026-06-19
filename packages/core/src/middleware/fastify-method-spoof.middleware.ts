import type { InertiaModuleOptions } from '../types.js';
import { type SpoofableRequest, applyMethodSpoof } from './apply-method-spoof.js';

interface FastifyHookApp {
  addHook: (event: string, handler: (req: unknown, reply: unknown) => Promise<void> | void) => void;
}

export function registerFastifyMethodSpoof(
  app: FastifyHookApp,
  options: InertiaModuleOptions,
): void {
  // methodSpoofing defaults to false (opt-in); skip unless explicitly enabled
  if (options.methodSpoofing !== true) return;
  app.addHook('preHandler', async (req: unknown) => {
    applyMethodSpoof(req as SpoofableRequest);
  });
}
