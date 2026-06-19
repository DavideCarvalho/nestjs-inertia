import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { HttpAdapterHost, ModuleRef, Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { RequestAdapter } from '../adapter/adapter.js';
import { resolvePlatformAdapter } from '../adapter/resolve-adapter.js';
import type { Manifest } from '../asset/version.provider.js';
import { INERTIA_USE_SCOPE } from '../decorator/use-inertia.decorator.js';
import { InertiaService, type InertiaServiceDeps } from '../service.js';
import type { ShellRenderer } from '../shell/shell.js';
import { featureToken } from '../tokens.js';
import type { InertiaModuleOptions } from '../types.js';

/**
 * Per-scope resolution cache.
 *
 * All providers resolved here are bootstrap-time singletons that never change
 * after the application has started, so they are resolved once per scope and
 * reused on subsequent requests. Only the per-request `InertiaService`
 * (which depends on the live request/response) is rebuilt per request.
 */
interface ScopeResolution {
  deps: InertiaServiceDeps;
  adapter: RequestAdapter;
}

@Injectable()
export class InertiaScopeSwitcherInterceptor implements NestInterceptor {
  private readonly scopeCache = new Map<string, ScopeResolution>();

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  private resolveScope(scope: string): ScopeResolution {
    const cached = this.scopeCache.get(scope);
    if (cached) {
      return cached;
    }

    const opts = this.moduleRef.get<InertiaModuleOptions>(featureToken('OPTIONS', scope), {
      strict: false,
    });
    const manifest = this.moduleRef.get<Manifest | null>(featureToken('MANIFEST', scope), {
      strict: false,
    });
    const assetVersion = this.moduleRef.get<string>(featureToken('ASSET_VERSION', scope), {
      strict: false,
    });
    const shellRenderer = this.moduleRef.get<ShellRenderer>(featureToken('SHELL_RENDERER', scope), {
      strict: false,
    });
    const ssrLoader = this.moduleRef.get<{ load: () => Promise<never> }>(
      featureToken('SSR_LOADER', scope),
      { strict: false },
    );

    const deps: InertiaServiceDeps = {
      assetVersion,
      manifest,
      ssrLoader,
      rootViewRender: (c) => shellRenderer.render(c),
      rootViewRenderToParts: shellRenderer.renderToParts
        ? (c) => shellRenderer.renderToParts!(c)
        : undefined,
      ssrStreaming: (opts as { ssr?: { streaming?: boolean } }).ssr?.streaming,
      moduleShare: (opts as { share?: unknown }).share as InertiaModuleOptions['share'],
      featureShare: undefined,
      historyEncryptionDefault:
        (opts as { historyEncryption?: { default?: boolean } }).historyEncryption?.default ?? false,
      flashStore: (opts as { flashStore?: InertiaModuleOptions['flashStore'] }).flashStore,
      diagnostics: (opts as { diagnostics?: boolean }).diagnostics,
    };
    const adapter = resolvePlatformAdapter(this.httpAdapterHost);

    const resolution: ScopeResolution = { deps, adapter };
    this.scopeCache.set(scope, resolution);
    return resolution;
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.getAllAndOverride<string>(INERTIA_USE_SCOPE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (scope && scope !== 'default') {
      const { deps, adapter } = this.resolveScope(scope);

      const req = ctx.switchToHttp().getRequest();
      const res = ctx.switchToHttp().getResponse();

      req.inertia = new InertiaService(adapter.adaptRequest(req), adapter.adaptResponse(res), deps);
    }
    return next.handle();
  }
}
