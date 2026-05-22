import { fastifyAdapter } from '../adapter/fastify.js';
import type { InertiaServiceDeps } from '../service.js';
import { InertiaService } from '../service.js';

interface FastifyApp {
  decorateRequest: (key: string, value: unknown) => void;
  addHook: (event: string, handler: (req: unknown, reply: unknown) => Promise<void> | void) => void;
}

export function registerFastifyInertia(
  app: FastifyApp,
  depsFactory: () => InertiaServiceDeps,
): void {
  // Guard against double-registration when forRoot + forFeature both call onApplicationBootstrap
  const appAsAny = app as unknown as { _inertiaRegistered?: boolean };
  if (appAsAny._inertiaRegistered) return;
  appAsAny._inertiaRegistered = true;

  app.decorateRequest('inertia', null);
  app.addHook('onRequest', async (req: unknown, reply: unknown) => {
    const adaptedReq = fastifyAdapter.adaptRequest(req);
    const adaptedRes = fastifyAdapter.adaptResponse(reply);
    (req as unknown as { inertia: InertiaService }).inertia = new InertiaService(
      adaptedReq,
      adaptedRes,
      depsFactory(),
    );
  });
}
