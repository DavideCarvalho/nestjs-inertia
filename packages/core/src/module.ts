import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, type Provider, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { extname } from 'node:path';
import { INERTIA_ASSET_VERSION, INERTIA_MANIFEST, INERTIA_MODULE_OPTIONS, assertScopeNotReserved, featureToken } from './tokens.js';
import { assetVersionProvider, loadManifest, computeAssetVersion, manifestProvider } from './asset/version.provider.js';
import { InertiaMiddleware } from './middleware/express.middleware.js';
import { DefaultShellRenderer } from './shell/shell.js';
import { FileBasedShellRenderer } from './shell/file-shell.renderer.js';
import { SsrLoaderService } from './ssr/ssr-loader.service.js';
import type { InertiaFeatureAsyncOptions, InertiaFeatureOptions, InertiaModuleAsyncOptions, InertiaModuleOptions, InertiaOptionsFactory, RootViewFn, ShellRenderCtx } from './types.js';
import { InvalidInertiaConfigException, UnsupportedRootViewExtensionException } from './errors/exceptions.js';
import { InertiaRenderInterceptor } from './interceptor/render.interceptor.js';
import { RedirectInterceptor } from './interceptor/redirect.interceptor.js';
import { MethodSpoofMiddleware } from './middleware/method-spoof.middleware.js';
import type { ShellRenderer } from './shell/shell.js';
import { InertiaScopeSwitcherInterceptor } from './interceptor/scope-switcher.interceptor.js';
import type { Manifest } from './asset/version.provider.js';

@Module({})
export class InertiaModule implements NestModule {
  static forRoot(options: InertiaModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: INERTIA_MODULE_OPTIONS,
      useValue: options,
    };

    const shellProvider: Provider = {
      provide: 'INERTIA_SHELL_RENDERER',
      inject: [INERTIA_MODULE_OPTIONS],
      useFactory: (opts: InertiaModuleOptions): ShellRenderer => {
        const rv = opts.rootView;
        if (typeof rv === 'function') {
          const fn = rv as RootViewFn;
          return { render: async (ctx: ShellRenderCtx) => fn(ctx) };
        }
        if (typeof rv === 'string') {
          const ext = extname(rv).toLowerCase();
          if (ext !== '.html' && ext !== '.htm') {
            throw new UnsupportedRootViewExtensionException(ext);
          }
          return new FileBasedShellRenderer(rv);
        }
        return new DefaultShellRenderer();
      },
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
        MethodSpoofMiddleware,
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaScopeSwitcherInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaRenderInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: RedirectInterceptor,
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
      inject: [INERTIA_MODULE_OPTIONS],
      useFactory: (opts: InertiaModuleOptions): ShellRenderer => {
        const rv = opts.rootView;
        if (typeof rv === 'function') {
          const fn = rv as RootViewFn;
          return { render: async (ctx: ShellRenderCtx) => fn(ctx) };
        }
        if (typeof rv === 'string') {
          const ext = extname(rv).toLowerCase();
          if (ext !== '.html' && ext !== '.htm') {
            throw new UnsupportedRootViewExtensionException(ext);
          }
          return new FileBasedShellRenderer(rv);
        }
        return new DefaultShellRenderer();
      },
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
        MethodSpoofMiddleware,
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaScopeSwitcherInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: InertiaRenderInterceptor,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: RedirectInterceptor,
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

  static forFeature(options: InertiaFeatureOptions): DynamicModule {
    assertScopeNotReserved(options.scope);
    const optionsProvider: Provider = {
      provide: featureToken('OPTIONS', options.scope),
      useValue: options,
    };
    return {
      module: InertiaModule,
      global: true,
      providers: [optionsProvider, ...this.createFeatureProviders(options.scope)],
      exports: [
        featureToken('OPTIONS', options.scope),
        featureToken('MANIFEST', options.scope),
        featureToken('ASSET_VERSION', options.scope),
        featureToken('SHELL_RENDERER', options.scope),
        featureToken('SSR_LOADER', options.scope),
      ],
    };
  }

  static forFeatureAsync(asyncOptions: InertiaFeatureAsyncOptions): DynamicModule {
    assertScopeNotReserved(asyncOptions.scope);
    const scope = asyncOptions.scope;
    const optionsToken = featureToken('OPTIONS', scope);

    // Re-register inject tokens as providers within this module so NestJS can resolve them
    const injectProviders: Provider[] = (asyncOptions.inject ?? [])
      .filter((token): token is new (...args: unknown[]) => unknown => typeof token === 'function')
      .map(token => token as unknown as Provider);

    let optionsProviders: Provider[];
    if (asyncOptions.useFactory) {
      optionsProviders = [{
        provide: optionsToken,
        useFactory: async (...args: unknown[]) => {
          const opts = await asyncOptions.useFactory!(...args);
          return { ...opts, scope };
        },
        inject: (asyncOptions.inject ?? []) as never[],
      }];
    } else if (asyncOptions.useClass) {
      optionsProviders = [
        asyncOptions.useClass as unknown as Provider,
        {
          provide: optionsToken,
          useFactory: async (factory: { createInertiaOptions: () => unknown }) => ({ ...(await factory.createInertiaOptions() as object), scope }),
          inject: [asyncOptions.useClass] as never[],
        },
      ];
    } else if (asyncOptions.useExisting) {
      optionsProviders = [{
        provide: optionsToken,
        useFactory: async (factory: { createInertiaOptions: () => unknown }) => ({ ...(await factory.createInertiaOptions() as object), scope }),
        inject: [asyncOptions.useExisting] as never[],
      }];
    } else {
      throw new InvalidInertiaConfigException('forFeatureAsync requires one of useFactory/useClass/useExisting');
    }

    return {
      module: InertiaModule,
      global: true,
      imports: (asyncOptions.imports as DynamicModule['imports'] | undefined) ?? [],
      providers: [...injectProviders, ...optionsProviders, ...this.createFeatureProviders(scope)],
      exports: [
        optionsToken,
        featureToken('MANIFEST', scope),
        featureToken('ASSET_VERSION', scope),
        featureToken('SHELL_RENDERER', scope),
        featureToken('SSR_LOADER', scope),
      ],
    };
  }

  private static createFeatureProviders(scope: string): Provider[] {
    return [
      {
        provide: featureToken('MANIFEST', scope),
        inject: [featureToken('OPTIONS', scope)],
        useFactory: (opts: InertiaFeatureOptions) => {
          if (process.env.NODE_ENV !== 'production') return null;
          return loadManifest(opts.vite?.manifestPath ?? 'dist/inertia/client/.vite/manifest.json');
        },
      },
      {
        provide: featureToken('ASSET_VERSION', scope),
        inject: [featureToken('MANIFEST', scope), featureToken('OPTIONS', scope)],
        useFactory: async (manifest: Manifest | null, opts: InertiaFeatureOptions): Promise<string> => {
          if (opts.version !== undefined) {
            return typeof opts.version === 'function' ? await opts.version() : opts.version;
          }
          return computeAssetVersion(manifest);
        },
      },
      {
        provide: featureToken('SHELL_RENDERER', scope),
        inject: [featureToken('OPTIONS', scope)],
        useFactory: (opts: InertiaFeatureOptions): ShellRenderer => {
          const rv = opts.rootView;
          if (typeof rv === 'function') {
            const fn = rv as RootViewFn;
            return { render: async (ctx: ShellRenderCtx) => fn(ctx) };
          }
          if (typeof rv === 'string') {
            const ext = extname(rv).toLowerCase();
            if (ext !== '.html' && ext !== '.htm') {
              throw new UnsupportedRootViewExtensionException(ext);
            }
            return new FileBasedShellRenderer(rv);
          }
          return new DefaultShellRenderer();
        },
      },
      {
        provide: featureToken('SSR_LOADER', scope),
        inject: [featureToken('OPTIONS', scope)],
        useFactory: (opts: InertiaFeatureOptions) => new SsrLoaderService(opts as never),
      },
    ];
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
    consumer.apply(MethodSpoofMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    consumer.apply(InertiaMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
