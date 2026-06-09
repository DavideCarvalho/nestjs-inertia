import type { InertiaRenderDiagnostic } from './diagnostics.js';
import type { PageObject, Props } from './types.js';

/**
 * Marker-classification metadata that is NOT carried on the page object itself.
 * Collected during `render()`'s prop-resolution loop (the four in-loop
 * classification pushes can't be reconstructed afterwards) plus the partial-reload
 * header lists, so {@link buildDiagnostic} stays pure.
 */
export interface DiagnosticMarkerMeta {
  sharedKeys: string[];
  optionalKeys: string[];
  onceKeys: string[];
  excludedKeys: string[];
  isPartial: boolean;
  keep: string[] | null;
  exceptKeys: string[];
  resetKeys: string[];
  resetOnceKeys: string[];
  clientVersion: string | null;
}

/**
 * Per-response fields that vary between the publish sites.
 */
export interface DiagnosticOutcome {
  ssr: boolean;
  statusCode: number;
  versionMismatch: boolean;
}

/**
 * Pure builder for the `InertiaRenderDiagnostic` channel payload. Shared by all
 * three publish sites (XHR, SSR/HTML, and the 409 version-mismatch path) so the
 * ~18-field payload shape lives in exactly one place.
 *
 * Pure: reads nothing off `InertiaService` — every input is passed in. The
 * emitted payload must stay byte-identical to the previous hand-rolled literals
 * (the cross-repo contract with nestjs-telescope's InertiaWatcher).
 *
 * On the 409 mismatch path the caller passes a zeroed/empty `page` + `markerMeta`
 * and `resolvedProps: undefined`; the field-by-field copy below produces the same
 * minimal payload the old inline literal did.
 */
export function buildDiagnostic(
  page: PageObject,
  markerMeta: DiagnosticMarkerMeta,
  outcome: DiagnosticOutcome,
  ctx: {
    req: { originalUrl: string; method: string };
    isInertia: boolean;
    resolvedProps: unknown;
    assetVersion: string;
    encryptHistory: boolean;
    clearHistory: boolean;
    pageBytes: number;
  },
): InertiaRenderDiagnostic {
  return {
    v: 1,
    component: page.component,
    url: ctx.req.originalUrl,
    method: ctx.req.method,
    isInertia: ctx.isInertia,
    isPartial: markerMeta.isPartial,
    partial: {
      only: markerMeta.keep ?? [],
      except: markerMeta.exceptKeys,
      reset: markerMeta.resetKeys,
      resetOnce: markerMeta.resetOnceKeys,
    },
    props: {
      sharedKeys: markerMeta.sharedKeys,
      finalKeys: Object.keys(page.props),
      deferred: page.deferredProps ?? {},
      merge: page.mergeProps ?? [],
      deepMerge: page.deepMergeProps ?? [],
      matchPropsOn: page.matchPropsOn ?? {},
      optionalKeys: markerMeta.optionalKeys,
      onceKeys: markerMeta.onceKeys,
      excludedKeys: markerMeta.excludedKeys,
    },
    resolvedProps: ctx.resolvedProps,
    assetVersion: ctx.assetVersion,
    versionMismatch: outcome.versionMismatch,
    clientVersion: markerMeta.clientVersion,
    encryptHistory: ctx.encryptHistory,
    clearHistory: ctx.clearHistory,
    statusCode: outcome.statusCode,
    pageBytes: ctx.pageBytes,
    ssr: outcome.ssr,
  };
}
