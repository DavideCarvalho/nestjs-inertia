import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';
import { applyMethodSpoof } from './apply-method-spoof.js';

@Injectable()
export class MethodSpoofMiddleware implements NestMiddleware {
  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions) {}

  use(req: Request & { body?: Record<string, unknown> }, _res: Response, next: NextFunction): void {
    // methodSpoofing defaults to false (opt-in); skip unless explicitly enabled.
    if (this.options.methodSpoofing === true) applyMethodSpoof(req);
    next();
  }
}
