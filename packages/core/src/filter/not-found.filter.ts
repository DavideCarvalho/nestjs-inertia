import { ArgumentsHost, Catch, ExceptionFilter, Logger, NotFoundException } from '@nestjs/common';
import type { InertiaService } from '../service.js';

export interface InertiaNotFoundFilterOptions {
  apiPrefix: string;
  component: string;
}

@Catch(NotFoundException)
export class InertiaNotFoundFilter implements ExceptionFilter {
  private readonly logger = new Logger(InertiaNotFoundFilter.name);
  constructor(private readonly options: InertiaNotFoundFilterOptions) {}

  async catch(exception: NotFoundException, host: ArgumentsHost): Promise<void> {
    const req = host.switchToHttp().getRequest<{ originalUrl?: string; url?: string; inertia?: InertiaService }>();
    const res = host.switchToHttp().getResponse<{ status(code: number): { json(b: unknown): void }; headersSent?: boolean }>();
    const path = req.originalUrl ?? req.url ?? '/';

    if (path.startsWith(this.options.apiPrefix)) {
      return this.respondJson(res, path, exception);
    }
    if (!req.inertia) {
      return this.respondJson(res, path, exception);
    }
    try {
      (res as unknown as { status: (n: number) => unknown }).status(404);
      await req.inertia.render(this.options.component, { requestedPath: path });
    } catch (renderErr) {
      this.logger.error(`Failed to render NotFound for ${path}`, renderErr instanceof Error ? renderErr.stack : String(renderErr));
      this.respondJson(res, path, exception);
    }
  }

  private respondJson(res: unknown, path: string, exception: NotFoundException): void {
    const r = res as { status(code: number): { json(b: unknown): void }; headersSent?: boolean };
    if (r.headersSent) return;
    r.status(404).json({
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path,
      message: exception.message,
      errorCode: 'NOT_FOUND',
    });
  }
}
