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

/**
 * Empty interface for module augmentation by codegen.
 * When codegen runs, it augments this interface with `{ 'PageName': true; ... }`
 * entries for every discovered page. The `Inertia()` decorator uses `keyof InertiaPages`
 * to restrict its argument to valid page names.
 *
 * Without codegen (empty interface): `keyof InertiaPages` is `never`, and the
 * decorator falls back to accepting any `string`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InertiaPages {}
