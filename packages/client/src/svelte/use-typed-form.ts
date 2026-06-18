/* v8 ignore next -- import resolution is not a branch */
import { useForm as inertiaUseForm } from '@inertiajs/svelte';
import type { InertiaForm, InertiaPrecognitiveForm } from '@inertiajs/svelte';

export type { InertiaPageProps } from '../shared/deferred-types.js';

/**
 * Typed wrapper over `@inertiajs/svelte`'s `useForm`.
 *
 * This is a thin TYPE layer — at runtime it delegates verbatim to the official
 * function, so the returned value is the same Svelte store the official adapter
 * produces (subscribe with `$form`, mutate fields directly, then call
 * `$form.post(...)`). All of Inertia v2's form ergonomics (precognition,
 * `transform`, `defaults`, progress, etc.) are preserved.
 *
 * The value it adds is end-to-end typing: the store's data fields, `errors`,
 * `reset`, `clearErrors`, and `setError` are all keyed by the fields of `TForm`.
 * Because the NestJS server flattens class-validator errors into a flat,
 * field-keyed bag (e.g. `items.0.qty`) that lines up byte-for-byte with
 * Inertia's `FormDataKeys<TForm>`, the server validation error bag and the
 * client field types are bound together with no extra mapping.
 *
 * Pass `TForm` explicitly (derived from a page via
 * {@link import('../shared/deferred-types.js').InertiaPageProps} or declared
 * inline) to get fully-typed `errors`:
 *
 * ```svelte
 * <script lang="ts">
 *   import { useForm } from '@dudousxd/nestjs-inertia-client/svelte';
 *   const form = useForm({ email: '', password: '' });
 * </script>
 * <input bind:value={$form.email} />
 * {$form.errors.email}
 * ```
 */
export function useForm<TForm extends Record<string, unknown>>(
  data: TForm | (() => TForm),
): InertiaPrecognitiveForm<TForm>;
export function useForm<TForm extends Record<string, unknown>>(
  rememberKey: string,
  data: TForm | (() => TForm),
): InertiaForm<TForm>;
// biome-ignore lint/suspicious/noExplicitAny: forwards the official function's overload set verbatim
export function useForm(...args: any[]): any {
  // biome-ignore lint/suspicious/noExplicitAny: see above — overloads are enforced by the public signatures
  return (inertiaUseForm as (...a: any[]) => any)(...args);
}
