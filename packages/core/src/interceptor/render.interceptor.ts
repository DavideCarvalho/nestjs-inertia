import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, type Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { INERTIA_RENDER_COMPONENT } from '../decorator/inertia.decorator.js';
import { InertiaServiceNotAvailableException } from '../errors/exceptions.js';
import type { InertiaService } from '../service.js';
import type { Props } from '../types.js';

@Injectable()
export class InertiaRenderInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const component = this.reflector.get<string | undefined>(
      INERTIA_RENDER_COMPONENT,
      context.getHandler(),
    );
    if (!component) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ inertia?: InertiaService }>();
    const res = context.switchToHttp().getResponse<{ headersSent: boolean }>();

    return next.handle().pipe(
      switchMap((returnValue) => {
        if (res.headersSent) {
          return of(undefined); // handler already called req.inertia.render() manually
        }
        if (!req.inertia) {
          throw new InertiaServiceNotAvailableException();
        }
        const props = (returnValue ?? {}) as Props;
        return from(req.inertia.render(component, props)).pipe(switchMap(() => of(undefined)));
      }),
    );
  }
}
