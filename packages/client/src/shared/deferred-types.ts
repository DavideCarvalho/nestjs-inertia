import type { InertiaPages } from '@dudousxd/nestjs-inertia';

/**
 * The prop names a page exposes, used to type the `data` key list of the
 * deferred client components. When codegen has augmented `InertiaPages`, this
 * resolves to the page's actual prop names; otherwise it falls back to `string`
 * so the components compile without codegen.
 *
 * Framework-agnostic: shared by the React, Vue, and Svelte adapters.
 */
export type DeferredPropKey<K extends keyof InertiaPages | unknown = unknown> =
  K extends keyof InertiaPages ? Extract<keyof InertiaPages[K], string> : string;

/**
 * The page-prop shape declared by codegen (`InertiaPages[K]`), reused by the
 * typed `useForm` wrappers to derive a form shape from a page's props.
 *
 * Framework-agnostic.
 */
export type InertiaPageProps<K extends keyof InertiaPages> = InertiaPages[K];
