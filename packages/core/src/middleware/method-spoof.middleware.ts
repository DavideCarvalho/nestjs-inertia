import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

const ALLOWED = new Set(['PUT', 'PATCH', 'DELETE']);

@Injectable()
export class MethodSpoofMiddleware implements NestMiddleware {
  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions) {}

  use(req: Request & { body?: Record<string, unknown> }, _res: Response, next: NextFunction): void {
    // biome-ignore lint/correctness/noVoidTypeReturn: NextFunction() returns void; early-return guard pattern
    if (this.options.methodSpoofing === false) return next();
    // biome-ignore lint/correctness/noVoidTypeReturn: NextFunction() returns void; early-return guard pattern
    if (req.method !== 'POST') return next();
    const contentType = (req.headers['content-type'] ?? '').toString().toLowerCase();
    // biome-ignore lint/correctness/noVoidTypeReturn: NextFunction() returns void; early-return guard pattern
    if (!contentType.startsWith('multipart/')) return next();
    const spoofed = String(req.body?._method ?? '').toUpperCase();
    if (ALLOWED.has(spoofed)) {
      (req as unknown as { method: string }).method = spoofed;
      if (req.body && typeof req.body === 'object') {
        req.body._method = undefined;
      }
    }
    next();
  }
}
