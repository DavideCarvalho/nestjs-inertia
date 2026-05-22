import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, type Provider } from '@nestjs/common';
import { INERTIA_MODULE_OPTIONS } from './tokens.js';
import { assetVersionProvider, manifestProvider } from './asset/version.provider.js';
import { InertiaMiddleware } from './middleware/express.middleware.js';
import { DefaultShellRenderer } from './shell/shell.js';
import { SsrLoaderService } from './ssr/ssr-loader.service.js';
import type { InertiaModuleOptions } from './types.js';

@Module({})
export class InertiaModule implements NestModule {
  static forRoot(options: InertiaModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: INERTIA_MODULE_OPTIONS,
      useValue: options,
    };

    const shellProvider: Provider = {
      provide: 'INERTIA_SHELL_RENDERER',
      useFactory: () => new DefaultShellRenderer(),
    };

    const ssrProvider: Provider = {
      provide: 'INERTIA_SSR_LOADER',
      useClass: SsrLoaderService,
    };

    return {
      module: InertiaModule,
      global: true,
      providers: [
        optionsProvider,
        manifestProvider,
        assetVersionProvider,
        shellProvider,
        ssrProvider,
        InertiaMiddleware,
      ],
      exports: [
        INERTIA_MODULE_OPTIONS,
        'INERTIA_SHELL_RENDERER',
        'INERTIA_SSR_LOADER',
        InertiaMiddleware,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(InertiaMiddleware).forRoutes({ path: '*', method: 0 });
  }
}
