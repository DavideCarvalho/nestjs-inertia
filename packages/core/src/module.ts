import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, type Provider, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS } from './tokens.js';
import { assetVersionProvider, manifestProvider } from './asset/version.provider.js';
import { InertiaMiddleware } from './middleware/express.middleware.js';
import { DefaultShellRenderer } from './shell/shell.js';
import { SsrLoaderService } from './ssr/ssr-loader.service.js';
import type { InertiaModuleAsyncOptions, InertiaModuleOptions, InertiaOptionsFactory } from './types.js';
import { InvalidInertiaConfigException } from './errors/exceptions.js';
import { InertiaRenderInterceptor } from './interceptor/render.interceptor.js';

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
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaRenderInterceptor,
        },
      ],
      exports: [
        INERTIA_MODULE_OPTIONS,
        INERTIA_MANIFEST,
        INERTIA_ASSET_VERSION,
        'INERTIA_SHELL_RENDERER',
        'INERTIA_SSR_LOADER',
        InertiaMiddleware,
      ],
    };
  }

  static forRootAsync(asyncOptions: InertiaModuleAsyncOptions): DynamicModule {
    this.validateAsyncOptions(asyncOptions);

    const optionsProviders: Provider[] = this.createAsyncOptionsProviders(asyncOptions);

    // Register inject tokens as providers so NestJS can resolve them within this module
    const injectProviders: Provider[] = (asyncOptions.inject ?? [])
      .filter((token): token is new (...args: unknown[]) => unknown => typeof token === 'function')
      .map(token => token as unknown as Provider);

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
      imports: (asyncOptions.imports as DynamicModule['imports'] | undefined) ?? [],
      providers: [
        ...injectProviders,
        ...optionsProviders,
        manifestProvider,
        assetVersionProvider,
        shellProvider,
        ssrProvider,
        InertiaMiddleware,
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaRenderInterceptor,
        },
      ],
      exports: [
        INERTIA_MODULE_OPTIONS,
        INERTIA_MANIFEST,
        INERTIA_ASSET_VERSION,
        'INERTIA_SHELL_RENDERER',
        'INERTIA_SSR_LOADER',
        InertiaMiddleware,
      ],
    };
  }

  private static validateAsyncOptions(asyncOptions: InertiaModuleAsyncOptions): void {
    const has = (k: keyof InertiaModuleAsyncOptions): boolean => asyncOptions[k] !== undefined;
    const declared = [has('useFactory'), has('useClass'), has('useExisting')].filter(Boolean).length;
    if (declared === 0) {
      throw new InvalidInertiaConfigException(
        'forRootAsync requires one of: useFactory, useClass, useExisting',
      );
    }
    if (declared > 1) {
      throw new InvalidInertiaConfigException(
        'forRootAsync accepts exactly one of: useFactory, useClass, useExisting (got multiple)',
      );
    }
  }

  private static createAsyncOptionsProviders(asyncOptions: InertiaModuleAsyncOptions): Provider[] {
    if (asyncOptions.useFactory) {
      return [{
        provide: INERTIA_MODULE_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: (asyncOptions.inject ?? []) as never[],
      }];
    }
    if (asyncOptions.useClass) {
      return [
        asyncOptions.useClass as unknown as Provider,
        {
          provide: INERTIA_MODULE_OPTIONS,
          useFactory: async (factory: InertiaOptionsFactory) => factory.createInertiaOptions(),
          inject: [asyncOptions.useClass] as never[],
        },
      ];
    }
    // useExisting: register the class as a provider so NestJS can resolve it within this module,
    // then use useFactory to call createInertiaOptions() on it (mirrors the useExisting intent).
    return [
      asyncOptions.useExisting! as unknown as Provider,
      {
        provide: INERTIA_MODULE_OPTIONS,
        useFactory: async (factory: InertiaOptionsFactory) => factory.createInertiaOptions(),
        inject: [asyncOptions.useExisting!] as never[],
      },
    ];
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(InertiaMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
