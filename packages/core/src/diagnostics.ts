import { emit, getChannel } from '@dudousxd/nestjs-diagnostics';

/**
 * The standard `aviary:` channel this library emits render diagnostics on, via
 * the shared `@dudousxd/nestjs-diagnostics` convention. `getChannel` registers the
 * name so the generic `@dudousxd/nestjs-diagnostics-telescope` watcher discovers
 * it. Read `.hasSubscribers` to gate the (potentially expensive) payload build —
 * when nothing subscribes the render path stays free.
 */
export const inertiaRenderChannel = getChannel('inertia', 'render');

/**
 * Publish one render diagnostic via the standard envelope (`{ ts, lib, event,
 * traceId?, payload }`), with `traceId` auto-filled from the optional context
 * accessor. `emit` re-checks `hasSubscribers` and never throws.
 */
export function publishInertiaRender(payload: InertiaRenderDiagnostic): void {
  emit('inertia', 'render', payload);
}

export interface InertiaRenderDiagnostic {
  v: 1;
  component: string;
  url: string;
  method: string;
  isInertia: boolean;
  isPartial: boolean;
  partial: { only: string[]; except: string[]; reset: string[]; resetOnce: string[] };
  props: {
    sharedKeys: string[];
    finalKeys: string[];
    deferred: Record<string, string[]>;
    merge: string[];
    deepMerge: string[];
    matchPropsOn: Record<string, string | string[]>;
    optionalKeys: string[];
    onceKeys: string[];
    excludedKeys: string[];
  };
  /** FINAL wire props by REFERENCE — never pre-stringified. */
  resolvedProps: unknown;
  assetVersion: string;
  versionMismatch: boolean;
  clientVersion: string | null;
  encryptHistory: boolean;
  clearHistory: boolean;
  statusCode: number;
  pageBytes: number;
  ssr: boolean;
}
