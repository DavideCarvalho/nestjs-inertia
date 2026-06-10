import type { CodegenExtension } from '@dudousxd/nestjs-codegen/extension';

const NAVIGATE_OPTIONS = `export type NavigateOptions = {
  method?: string;
  data?: Record<string, unknown>;
  preserveState?: boolean;
  preserveScroll?: boolean;
  replace?: boolean;
};`;

const NAVIGATE_FN = `/**
 * Type-safe navigation using Inertia router.
 * Resolves the URL from the named route and calls \`router.visit()\`.
 */
export function navigate<K extends RouteName>(
  name: K,
  ...args: ExtractParams<(typeof ROUTES)[K]> extends never
    ? [options?: NavigateOptions]
    : [options: { params: RouteParams<K> } & NavigateOptions]
): void {
  const [options] = args as [({ params?: Record<string, string> } & NavigateOptions) | undefined];
  const url = route(name as never, (options as any)?.params as never);
  const { params: _p, ...visitOptions } = options ?? {} as any;
  router.visit(url, visitOptions);
}`;

/**
 * nestjs-inertia codegen extension. Adds the Inertia `router` import and a type-safe
 * `navigate()` helper to the generated `api.ts`, so mutations/links can drive Inertia
 * visits. Register it via `forRoot({ extensions: [nestjsInertiaCodegen()] })`.
 *
 * (Inertia page discovery — `pages.d.ts`/`components.json` — is still handled by the core
 * `pages` config; this extension owns the `api.ts` Inertia surface.)
 */
export function nestjsInertiaCodegen(): CodegenExtension {
  const ext: CodegenExtension = {
    name: 'nestjs-inertia',
    apiHeader() {
      return {
        imports: ["import { router } from '@inertiajs/react';"],
        statements: [NAVIGATE_OPTIONS, NAVIGATE_FN],
      };
    },
  };
  return ext;
}

export default nestjsInertiaCodegen;
