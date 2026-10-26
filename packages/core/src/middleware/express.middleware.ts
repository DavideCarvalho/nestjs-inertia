import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { expressAdapter } from '../adapter/express.js';
import type { Manifest } from '../asset/version.provider.js';
import { defineLazyInertia } from '../helpers/define-lazy-inertia.js';
import { suppressPostSendWrites } from '../helpers/suppress-post-send-writes.js';
import { InertiaService } from '../service.js';
import type { InertiaServiceDeps, SsrLoader } from '../service.js';
import type { ShellRenderer } from '../shell/shell.js';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

@Injectable()
export class InertiaMiddleware implements NestMiddleware {
  private readonly deps: InertiaServiceDeps;

  constructor(
    @Inject(INERTIA_ASSET_VERSION) assetVersion: string,
    @Inject(INERTIA_MANIFEST) manifest: Manifest | null,
    @Inject(INERTIA_MODULE_OPTIONS) options: InertiaModuleOptions,
    @Inject('INERTIA_SHELL_RENDERER') shellRenderer: ShellRenderer,
    @Inject('INERTIA_SSR_LOADER') ssrLoader: SsrLoader,
  ) {
    this.deps = {
      assetVersion,
      manifest,
      ssrLoader,
      rootViewRender: (ctx) => shellRenderer.render(ctx),
      rootViewRenderToParts: shellRenderer.renderToParts
        ? (ctx) => shellRenderer.renderToParts!(ctx)
        : undefined,
      ssrStreaming: options.ssr?.streaming,
      moduleShare: options.share,
      featureShare: undefined,
      historyEncryptionDefault: options.historyEncryption?.default ?? false,
      flashStore: options.flashStore,
      diagnostics: options.diagnostics,
    };
  }

  use(req: Request, res: Response, next: NextFunction): void {
    defineLazyInertia(
      req,
      () =>
        new InertiaService(
          expressAdapter.adaptRequest(req),
          expressAdapter.adaptResponse(res),
          this.deps,
        ),
    );

    suppressPostSendWrites(res as unknown as Parameters<typeof suppressPostSendWrites>[0]);
    next();
  }
}
