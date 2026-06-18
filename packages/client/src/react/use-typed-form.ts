/* v8 ignore next -- import resolution is not a branch */
import { useForm as inertiaUseForm } from '@inertiajs/react';
import type { InertiaFormProps, InertiaPrecognitiveFormProps } from '@inertiajs/react';

/**
 * The props of a page as declared by codegen (`InertiaPages[K]`).
 *
 * A page's form-input shape is, by convention, a subset of its rendered props
 * (the same field names the server validates and echoes back in the error bag).
 * `InertiaPageProps<K>` lets consumers derive a form shape from those props
 * without redeclaring field names, e.g.:
 *
 * ```ts
 * type LoginProps = InertiaPageProps<'auth/login'>;
 * const form = useForm<Pick<LoginProps, 'email' | 'password'>>({
 *   email: '',
 *   password: '',
 * });
 * ```
 */
export type { InertiaPageProps } from '../shared/deferred-types.js';

/**
 * Typed wrapper over `@inertiajs/react`'s `useForm`.
 *
 * This is a thin TYPE layer — at runtime it delegates verbatim to the official
 * hook, so all of Inertia v2's form ergonomics (precognition, `transform`,
 * `setDefaults`, progress, etc.) are preserved.
 *
 * The value it adds is end-to-end typing: the form's `data`, `setData`,
 * `errors`, `reset`, `clearErrors`, and `setError` are all keyed by the fields
 * of `TForm`. Because the NestJS server flattens class-validator errors into a
 * flat, field-keyed bag (e.g. `items.0.qty`) that lines up byte-for-byte with
 * Inertia's `FormDataKeys<TForm>`, the server validation error bag and the
 * client field types are bound together with no extra mapping.
 *
 * Pass `TForm` explicitly (derived from a page via {@link InertiaPageProps} or
 * declared inline) to get fully-typed `errors`:
 *
 * ```ts
 * const form = useForm({ email: '', password: '' });
 * form.errors.email;    // string | undefined  (typed)
 * form.errors.unknown;  // type error
 * ```
 */
export function useForm<TForm extends Record<string, unknown>>(
  data: TForm | (() => TForm),
): InertiaPrecognitiveFormProps<TForm>;
export function useForm<TForm extends Record<string, unknown>>(
  rememberKey: string,
  data: TForm | (() => TForm),
): InertiaFormProps<TForm>;
// biome-ignore lint/suspicious/noExplicitAny: forwards the official hook's overload set verbatim
export function useForm(...args: any[]): any {
  // biome-ignore lint/suspicious/noExplicitAny: see above — overloads are enforced by the public signatures
  return (inertiaUseForm as (...a: any[]) => any)(...args);
}
