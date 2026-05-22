import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { Observable } from 'rxjs';
import { INERTIA_USE_SCOPE } from '../decorator/use-inertia.decorator.js';
import { featureToken } from '../tokens.js';
import { expressAdapter } from '../adapter/express.js';
import { InertiaService, type InertiaServiceDeps } from '../service.js';
import type { ShellRenderer } from '../shell/shell.js';
import type { Manifest } from '../asset/version.provider.js';
import type { InertiaModuleOptions } from '../types.js';

@Injectable()
export class InertiaScopeSwitcherInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.getAllAndOverride<string>(INERTIA_USE_SCOPE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (scope && scope !== 'default') {
      const opts = this.moduleRef.get<InertiaModuleOptions>(featureToken('OPTIONS', scope), { strict: false });
      const manifest = this.moduleRef.get<Manifest | null>(featureToken('MANIFEST', scope), { strict: false });
      const assetVersion = this.moduleRef.get<string>(featureToken('ASSET_VERSION', scope), { strict: false });
      const shellRenderer = this.moduleRef.get<ShellRenderer>(featureToken('SHELL_RENDERER', scope), { strict: false });
      const ssrLoader = this.moduleRef.get<{ load: () => Promise<never> }>(featureToken('SSR_LOADER', scope), { strict: false });

      const req = ctx.switchToHttp().getRequest();
      const res = ctx.switchToHttp().getResponse();
      const deps: InertiaServiceDeps = {
        assetVersion,
        manifest,
        ssrLoader,
        rootViewRender: (c) => shellRenderer.render(c),
        moduleShare: (opts as { share?: unknown }).share as InertiaModuleOptions['share'],
        featureShare: undefined,
        historyEncryptionDefault: (opts as { historyEncryption?: { default?: boolean } }).historyEncryption?.default ?? false,
        flashStore: (opts as { flashStore?: InertiaModuleOptions['flashStore'] }).flashStore,
      };
      req.inertia = new InertiaService(
        expressAdapter.adaptRequest(req),
        expressAdapter.adaptResponse(res),
        deps,
      );
    }
    return next.handle();
  }
}
