import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from '../tokens.js';
import { expressAdapter } from '../adapter/express.js';
import { InertiaService } from '../service.js';
import { suppressPostSendWrites } from '../helpers/suppress-post-send-writes.js';
import type { InertiaModuleOptions, ShellRenderCtx } from '../types.js';
import type { Manifest } from '../asset/version.provider.js';
import type { SsrLoader } from '../service.js';

export interface ShellRenderer {
  render(ctx: ShellRenderCtx): Promise<string>;
}

@Injectable()
export class InertiaMiddleware implements NestMiddleware {
  constructor(
    @Inject(INERTIA_ASSET_VERSION) private readonly assetVersion: string,
    @Inject(INERTIA_MANIFEST) private readonly manifest: Manifest | null,
    @Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions,
    @Inject('INERTIA_SHELL_RENDERER') private readonly shellRenderer: ShellRenderer,
    @Inject('INERTIA_SSR_LOADER') private readonly ssrLoader: SsrLoader,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const adaptedReq = expressAdapter.adaptRequest(req);
    const adaptedRes = expressAdapter.adaptResponse(res);

    (req as Request & { inertia?: InertiaService }).inertia = new InertiaService(adaptedReq, adaptedRes, {
      assetVersion: this.assetVersion,
      manifest: this.manifest,
      ssrLoader: this.ssrLoader,
      rootViewRender: (ctx) => this.shellRenderer.render(ctx),
      moduleShare: this.options.share,
      featureShare: undefined,
      historyEncryptionDefault: this.options.historyEncryption?.default ?? false,
    });

    suppressPostSendWrites(res as unknown as Parameters<typeof suppressPostSendWrites>[0]);
    next();
  }
}
