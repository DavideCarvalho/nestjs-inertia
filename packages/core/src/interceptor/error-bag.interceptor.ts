import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ErrorBagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ header(n: string): string | undefined }>();
    const bag = req.header('X-Inertia-Error-Bag');
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
