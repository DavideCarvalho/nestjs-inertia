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

export interface FlashStore {
  read(req: unknown): FlashErrors | Promise<FlashErrors>;
  write?(req: unknown, errors: FlashErrors): void | Promise<void>;
}
