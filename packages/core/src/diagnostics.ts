import diagnostics_channel from 'node:diagnostics_channel';

/** Channel name — the wire contract with nestjs-telescope's InertiaWatcher.
 *  Versioned by the payload's `v` field, not by name. */
export const INERTIA_DIAG_CHANNEL = 'nestjs-inertia:render';

/** Memoized by Node: same object per name. Read `.hasSubscribers` to gate. */
export const inertiaDiagChannel = diagnostics_channel.channel(INERTIA_DIAG_CHANNEL);

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
    matchPropsOn: Record<string, string>;
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
