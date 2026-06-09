import type { FlashErrors } from '../flash/flash-store.js';

export interface ExtractOptions {
  /** How to combine multiple messages for the same field key. Default: 'first'. */
  mergeMessages?: 'first' | 'join';
}

interface ZodIssueLike {
  path: Array<string | number>;
  message: string;
}

/**
 * Extracts field-keyed error messages from a thrown validation exception.
 *
 * Recognizes (in order):
 *  1. The dedicated `{ __inertiaErrors }` payload from
 *     {@link inertiaValidationExceptionFactory} — returned as-is (lossless,
 *     including nested `items.0.qty` keys).
 *  2. `ContractValidationPipe` shape `{ message: 'Contract validation failed',
 *     issues: ZodIssue[] }` — issue paths joined with `.`.
 *  3. A raw `ZodError` (`{ name: 'ZodError', issues: [...] }`).
 *  4. A flat class-validator `message: string[]` — split on first space, leading
 *     token becomes the key (lossy fallback for flat DTOs).
 *
 * Returns `null` when the exception is not a recognized validation failure, so
 * the caller can rethrow it for normal handling.
 */
export function extractFieldErrors(
  exception: unknown,
  opts: ExtractOptions = {},
): FlashErrors | null {
  const mergeMessages = opts.mergeMessages ?? 'first';

  // Resolve the response body: a Nest HttpException exposes getResponse(),
  // otherwise inspect the raw object directly.
  const response = getExceptionResponse(exception);

  // 1. Dedicated factory payload.
  if (isRecord(response) && isRecord(response.__inertiaErrors)) {
    return response.__inertiaErrors as FlashErrors;
  }

  // 2. ContractValidationPipe shape.
  if (
    isRecord(response) &&
    response.message === 'Contract validation failed' &&
    Array.isArray(response.issues)
  ) {
    return mapZodIssues(response.issues as ZodIssueLike[], mergeMessages);
  }

  // 3. Raw ZodError (thrown directly and caught).
  if (isZodError(exception)) {
    return mapZodIssues(exception.issues as ZodIssueLike[], mergeMessages);
  }
  if (isZodError(response)) {
    return mapZodIssues((response as { issues: ZodIssueLike[] }).issues, mergeMessages);
  }

  // 4. Flat class-validator message: string[] heuristic.
  if (isRecord(response) && Array.isArray(response.message)) {
    const messages = response.message.filter((m): m is string => typeof m === 'string');
    if (messages.length > 0) {
      return mapFlatMessages(messages, mergeMessages);
    }
  }

  return null;
}

function getExceptionResponse(exception: unknown): unknown {
  if (
    isRecord(exception) &&
    typeof (exception as { getResponse?: unknown }).getResponse === 'function'
  ) {
    return (exception as { getResponse: () => unknown }).getResponse();
  }
  return exception;
}

function isZodError(value: unknown): value is { name: string; issues: ZodIssueLike[] } {
  return (
    isRecord(value) &&
    value.name === 'ZodError' &&
    Array.isArray((value as { issues?: unknown }).issues)
  );
}

function mapZodIssues(issues: ZodIssueLike[], mergeMessages: 'first' | 'join'): FlashErrors {
  const out: FlashErrors = {};
  for (const issue of issues) {
    const key = Array.isArray(issue.path) ? issue.path.join('.') : '';
    mergeInto(out, key, issue.message, mergeMessages);
  }
  return out;
}

function mapFlatMessages(messages: string[], mergeMessages: 'first' | 'join'): FlashErrors {
  const out: FlashErrors = {};
  for (const message of messages) {
    const spaceIdx = message.indexOf(' ');
    const key = spaceIdx === -1 ? message : message.slice(0, spaceIdx);
    mergeInto(out, key, message, mergeMessages);
  }
  return out;
}

function mergeInto(
  out: FlashErrors,
  key: string,
  message: string,
  mergeMessages: 'first' | 'join',
): void {
  if (key === '') return;
  const existing = out[key];
  if (existing === undefined) {
    out[key] = message;
    return;
  }
  if (mergeMessages === 'join' && typeof existing === 'string') {
    out[key] = `${existing} ${message}`;
  }
  // 'first' → keep existing.
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
