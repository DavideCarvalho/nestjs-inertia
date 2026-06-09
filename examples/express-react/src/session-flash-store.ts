import type { FlashErrors, FlashStore } from '@dudousxd/nestjs-inertia';
import type { Request } from 'express';

/**
 * express-session-backed FlashStore. The validation filter writes the error bag
 * to `req.session`; the GET-side `service.render()` reads it back once and clears
 * it (flash semantics). Both sides receive the raw Express request.
 */
export const sessionFlashStore: FlashStore = {
  read(req: unknown): FlashErrors {
    const session = (req as Request).session as { __inertiaErrors?: FlashErrors } | undefined;
    if (!session) return {};
    const errors = session.__inertiaErrors ?? {};
    // Flash: consume once.
    session.__inertiaErrors = undefined;
    return errors;
  },
  write(req: unknown, errors: FlashErrors): void {
    const session = (req as Request).session as { __inertiaErrors?: FlashErrors } | undefined;
    if (session) session.__inertiaErrors = errors;
  },
};
