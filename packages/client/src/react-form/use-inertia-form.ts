import { zodResolver } from '@hookform/resolvers/zod';
import { router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import {
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';
import type { ZodType } from 'zod';
import { mergeServerErrors } from '../shared/merge-server-errors.js';

type HttpMethod = 'post' | 'put' | 'patch' | 'delete';

export interface UseInertiaFormOptions<TValues extends FieldValues> {
  /** zod schema for the body (from the generated forms.ts). */
  schema: ZodType<TValues>;
  /** Inertia endpoint: a `route(...)` URL (defaults to POST) or `{ method, url }`. */
  action: string | { method: HttpMethod; url: string };
  defaultValues?: DefaultValues<TValues>;
  /** Error-bag name → sent as `X-Inertia-Error-Bag` and read back from `props.errors[bag]`. */
  errorBag?: string;
  /** Reset the form to `defaultValues` on a successful submit. Default `false`. */
  resetOnSuccess?: boolean;
  /** Inertia visit options passthrough (preserveScroll, only, headers…). */
  visitOptions?: Record<string, unknown>;
  /** RHF `useForm` options passthrough (mode, criteriaMode…). */
  formProps?: Parameters<typeof useForm<TValues>>[0];
}

export interface UseInertiaFormReturn<TValues extends FieldValues> extends UseFormReturn<TValues> {
  /** RHF-wrapped submit: validates client-side, then Inertia-visits. */
  submit: ReturnType<UseFormReturn<TValues>['handleSubmit']>;
  /** True while the Inertia visit is in flight (OR'd with RHF isSubmitting). */
  isSubmitting: boolean;
  /** Server-only / non-field error message (from `errors._` or unknown keys). */
  formError: string | undefined;
}

function normalizeAction(action: UseInertiaFormOptions<FieldValues>['action']): {
  method: HttpMethod;
  url: string;
} {
  if (typeof action === 'string') return { method: 'post', url: action };
  return { method: action.method, url: action.url };
}

/**
 * One-call typed form hook: wraps react-hook-form with a zod resolver, an
 * Inertia `router` submit, automatic server-error merge (into the same RHF error
 * state), and optional reset-on-success.
 */
export function useInertiaForm<TValues extends FieldValues>(
  options: UseInertiaFormOptions<TValues>,
): UseInertiaFormReturn<TValues> {
  const {
    schema,
    action,
    defaultValues,
    errorBag,
    resetOnSuccess = false,
    visitOptions,
    formProps,
  } = options;

  const form = useForm<TValues>({
    // biome-ignore lint/suspicious/noExplicitAny: zodResolver/RHF generic variance
    resolver: zodResolver(schema as any) as any,
    ...(defaultValues !== undefined ? { defaultValues } : {}),
    ...formProps,
  });

  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const page = usePage();
  const pageErrors = page.props.errors as Record<string, unknown> | undefined;
  const lastErrorsRef = useRef<unknown>(undefined);

  // Subscribe to the RHF errors proxy during render so server-side setError()
  // calls re-render consumers of this hook (RHF formState is lazy/proxied).
  void form.formState.errors;

  // Merge server errors into RHF state whenever the page-errors identity changes.
  // Keyed strictly on the errors object identity + tagged `type: 'server'` to
  // avoid a setError → re-render → re-apply loop (the other deps are stable RHF
  // methods / a primitive and must NOT widen the dep list, or the loop returns).
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on pageErrors identity by design
  useEffect(() => {
    if (pageErrors === lastErrorsRef.current) return;
    lastErrorsRef.current = pageErrors;

    const known = new Set(Object.keys(form.getValues() as object));
    const { formError: aggregated } = mergeServerErrors(
      pageErrors,
      errorBag,
      (path, message) => {
        form.setError(path as Path<TValues>, { type: 'server', message });
      },
      known,
    );
    setFormError(aggregated);
  }, [pageErrors]);

  const submit = form.handleSubmit((values) => {
    const { method, url } = normalizeAction(action);
    const headers: Record<string, string> = {
      ...(errorBag ? { 'X-Inertia-Error-Bag': errorBag } : {}),
      ...((visitOptions?.headers as Record<string, string> | undefined) ?? {}),
    };
    const { headers: _omit, ...restVisit } = visitOptions ?? {};
    router[method](url, values as Record<string, unknown>, {
      ...restVisit,
      headers,
      onStart: () => setProcessing(true),
      onFinish: () => setProcessing(false),
      onSuccess: () => {
        if (resetOnSuccess) form.reset(defaultValues);
        setFormError(undefined);
      },
      // Field errors are applied by the usePage effect above.
      onError: () => {},
    });
  });

  return {
    ...form,
    submit,
    isSubmitting: form.formState.isSubmitting || processing,
    formError,
  };
}
