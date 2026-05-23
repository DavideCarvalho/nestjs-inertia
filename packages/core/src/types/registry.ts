/**
 * Empty interface for module augmentation by codegen consumers.
 * Augment this interface (e.g. via `nestjs-inertia.d.ts` emitted by `nestjs-inertia init`)
 * to register typed `pages` / `shared` / `routes` maps.
 *
 * MUST remain an `interface` (not a `type` alias) — `declare module ... { interface ... }`
 * augmentation only works on interfaces. Converting to `type X = {}` silently breaks the
 * Link component's `routeParams` typing in every consumer app.
 */
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
