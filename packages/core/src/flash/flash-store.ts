/**
 * Server-side flash error bag. A field maps to a message string, or — when an
 * `X-Inertia-Error-Bag` is in play — to a nested bag of the same shape. The type
 * is recursive so error-bag scoping (one extra nesting level) is representable
 * without a cast. Declared as an interface (not a type alias) so the recursion
 * is legal under TS2456.
 */
export interface FlashErrors {
  [field: string]: string | FlashErrors;
}

/**
 * Arbitrary general flash payload (Laravel/Rails-style `flash`). Keys are
 * developer-defined (e.g. `success`, `info`, `status`) and values are any
 * JSON-serializable data. Surfaced to the client as the `flash` shared prop on
 * the next request, then cleared.
 */
export type FlashData = Record<string, unknown>;

export interface FlashStore {
  /** Read the flashed error bag for this request. */
  read(req: unknown): FlashErrors | Promise<FlashErrors>;
  /** Persist an error bag to be read on the next request (e.g. after a redirect). */
  write?(req: unknown, errors: FlashErrors): void | Promise<void>;
  /**
   * Read the general flash payload (non-error messages) for this request.
   * Optional — stores that only handle the error bag may omit it.
   */
  readFlash?(req: unknown): FlashData | Promise<FlashData>;
  /**
   * Persist general flash data to be read on the next request. New keys should
   * be merged with any already-pending flash data for the same request lifecycle.
   */
  writeFlash?(req: unknown, data: FlashData): void | Promise<void>;
}
