import { BadRequestException, type ValidationError } from '@nestjs/common';
import type { FlashErrors } from '../flash/flash-store.js';

/**
 * The blessed `ValidationPipe` exception factory.
 *
 * Plug into a class-validator `ValidationPipe`:
 *
 * ```ts
 * new ValidationPipe({ exceptionFactory: inertiaValidationExceptionFactory })
 * ```
 *
 * It maps the class-validator `ValidationError[]` into a structured payload
 * `{ __inertiaErrors }` that {@link extractFieldErrors} reads losslessly,
 * including nested `children` flattened into dot/numeric-index paths
 * (`items.0.qty`). This produces field-keyed errors that line up byte-for-byte
 * with the client-side form field paths.
 */
export function inertiaValidationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({ __inertiaErrors: flattenValidationErrors(errors) });
}

/**
 * Recursively flattens class-validator `ValidationError[]` into a flat
 * `FlashErrors` map keyed by dot/numeric-index JSON paths.
 *
 * - `error.property` is joined with the running prefix: `items` + `0` + `qty`
 *   → `items.0.qty`.
 * - The value is the first message in `error.constraints` (the constraint
 *   messages object). Nodes with only `children` (no own constraints) contribute
 *   no key themselves; their children do.
 */
export function flattenValidationErrors(errors: ValidationError[], prefix?: string): FlashErrors {
  const out: FlashErrors = {};
  for (const error of errors) {
    const key = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (messages.length > 0) {
      out[key] = messages[0]!;
    }
    if (error.children && error.children.length > 0) {
      Object.assign(out, flattenValidationErrors(error.children, key));
    }
  }
  return out;
}
