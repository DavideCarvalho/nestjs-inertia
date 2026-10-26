import type { InertiaService } from '../service.js';

/**
 * Defines `req.inertia` so the {@link InertiaService} is built on first read: requests
 * that never render (JSON APIs, static files) never construct one. Reading or assigning
 * replaces the accessor with a plain writable data property.
 */
export function defineLazyInertia(req: object, create: () => InertiaService): void {
  const settle = (value: unknown): void => {
    Object.defineProperty(req, 'inertia', {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  };
  Object.defineProperty(req, 'inertia', {
    get() {
      const service = create();
      settle(service);
      return service;
    },
    set: settle,
    enumerable: true,
    configurable: true,
  });
}
