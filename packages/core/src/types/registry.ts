// Empty interface for module augmentation by codegen consumers.
// Augment this interface to register typed page/route maps.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InertiaRegistry {}

/**
 * Resolves to the augmented routes map when `InertiaRegistry` has been extended
 * with a `routes` key (via `nestjs-inertia.d.ts`), otherwise falls back to
 * `Record<string, unknown>` so client code compiles without codegen.
 */
export type RegistryRoutes = InertiaRegistry extends { routes: infer R }
  ? R
  : Record<string, unknown>;
