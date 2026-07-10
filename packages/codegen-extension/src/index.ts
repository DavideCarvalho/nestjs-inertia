import type { CodegenExtension, EmittedFile } from '@dudousxd/nestjs-codegen/extension';
import { buildPageExcludesFile } from './page-excludes.js';
import { type SharedPropsSource, buildSharedFile } from './shared-props.js';

export type { SharedPropsSource } from './shared-props.js';

/**
 * Options for {@link nestjsInertiaCodegen}. Both are opt-in and additive to the always-on
 * `apiHeader` contribution — calling `nestjsInertiaCodegen()` with no arguments emits no
 * files, exactly as before this option object was introduced.
 */
export type NestjsInertiaCodegenOptions = {
  /** Emit `shared.ts` (the `InertiaSharedProps` type), sourced from an explicit module + export. */
  shared?: SharedPropsSource;
  /**
   * Emit `page-excludes.ts` — every `@Inertia` page route (path + method), for feeding
   * `setGlobalPrefix('api', { exclude })`. Throws if enabled but zero pages are discovered.
   */
  pageExcludes?: boolean;
};

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
 *
 * Optionally emits extra files via `emitFiles`, each independently opt-in:
 * - `shared`: `shared.ts` — the `InertiaSharedProps` type, sourced from an explicit module.
 * - `pageExcludes: true`: `page-excludes.ts` — every `@Inertia` page route, for
 *   `setGlobalPrefix('api', { exclude })`.
 *
 * With no options (or both omitted), no files are emitted — only `apiHeader` runs.
 */
export function nestjsInertiaCodegen(options: NestjsInertiaCodegenOptions = {}): CodegenExtension {
  const ext: CodegenExtension = {
    name: 'nestjs-inertia',
    apiHeader() {
      return {
        imports: ["import { router } from '@inertiajs/react';"],
        statements: [NAVIGATE_OPTIONS, NAVIGATE_FN],
      };
    },
  };

  if (options.shared || options.pageExcludes) {
    const sharedSource = options.shared;
    const pageExcludesEnabled = options.pageExcludes;
    ext.emitFiles = (ctx) => {
      const files: EmittedFile[] = [];
      if (sharedSource) files.push(buildSharedFile(sharedSource, ctx));
      if (pageExcludesEnabled) files.push(buildPageExcludesFile(ctx));
      return files;
    };
  }

  return ext;
}

export default nestjsInertiaCodegen;
