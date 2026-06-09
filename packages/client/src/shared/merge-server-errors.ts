/**
 * Framework-free server-error merge. Shared by the React hook today and the
 * documented Vue/Svelte recipes. Reads page errors (optionally scoped to an
 * error bag), applies each field message via `setError`, and aggregates unknown
 * keys / `_` / a top-level message into a single `formError`.
 */

export type SetFieldError = (path: string, message: string) => void;

export interface MergeResult {
  /** Field paths that were applied via setError. */
  applied: string[];
  /** Non-field / unknown / `_` aggregated message, if any. */
  formError: string | undefined;
}

export function mergeServerErrors(
  pageErrors: Record<string, unknown> | undefined,
  bag: string | undefined,
  setError: SetFieldError,
  knownFields?: Set<string>,
): MergeResult {
  const applied: string[] = [];
  const formMessages: string[] = [];

  if (!pageErrors || typeof pageErrors !== 'object') {
    return { applied, formError: undefined };
  }

  // Scope to the error bag when set (symmetric with the server-side write).
  let scoped: Record<string, unknown> | undefined = pageErrors;
  if (bag) {
    const inner = pageErrors[bag];
    scoped = isRecord(inner) ? inner : undefined;
  }
  if (!scoped) {
    return { applied, formError: undefined };
  }

  for (const [key, value] of Object.entries(scoped)) {
    const message = toMessage(value);
    if (message === undefined) continue;

    // `_` and any unknown key (not a registered field) → form-level error.
    if (key === '_' || (knownFields && !knownFields.has(key))) {
      formMessages.push(message);
      continue;
    }

    setError(key, message);
    applied.push(key);
  }

  return {
    applied,
    formError: formMessages.length > 0 ? formMessages.join(' ') : undefined,
  };
}

function toMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
