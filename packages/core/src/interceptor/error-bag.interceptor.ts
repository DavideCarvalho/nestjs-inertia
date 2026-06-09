import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getHeader } from '../helpers/get-header.js';

@Injectable()
export class ErrorBagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<unknown>();
    const bag = getHeader(req, 'X-Inertia-Error-Bag');
    if (!bag) return next.handle();
    return next.handle().pipe(
      map((value) => {
        if (typeof value !== 'object' || value === null) return value;
        const v = value as Record<string, unknown>;
        if (v.errors === undefined) return value;
        return { ...v, errors: { [bag]: v.errors } };
      }),
    );
  }
}
