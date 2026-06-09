import {
  type DynamicModule,
  Inject,
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
  type Provider,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR, HttpAdapterHost } from '@nestjs/core';
import {
  assetVersionProvider,
  computeAssetVersion,
  loadManifest,
  manifestProvider,
} from './asset/version.provider.js';
import type { Manifest } from './asset/version.provider.js';
import { InvalidInertiaConfigException } from './errors/exceptions.js';
import { RedirectInterceptor } from './interceptor/redirect.interceptor.js';
import { InertiaRenderInterceptor } from './interceptor/render.interceptor.js';
import { InertiaScopeSwitcherInterceptor } from './interceptor/scope-switcher.interceptor.js';
import { InertiaMiddleware } from './middleware/express.middleware.js';
import { registerFastifyInertia } from './middleware/fastify.middleware.js';
import { MethodSpoofMiddleware } from './middleware/method-spoof.middleware.js';
import { FileBasedShellRenderer } from './shell/file-shell.renderer.js';
import { DefaultShellRenderer } from './shell/shell.js';
import type { ShellRenderer } from './shell/shell.js';
import { SsrLoaderService } from './ssr/ssr-loader.service.js';
import {
  INERTIA_ASSET_VERSION,
  INERTIA_MANIFEST,
  INERTIA_MODULE_OPTIONS,
  assertScopeNotReserved,
  featureToken,
} from './tokens.js';
import type {
  InertiaFeatureAsyncOptions,
  InertiaFeatureOptions,
  InertiaModuleAsyncOptions,
  InertiaModuleOptions,
  InertiaOptionsFactory,
  RootViewFn,
  ShellRenderCtx,
} from './types.js';

/** Minimal interface matching `Watcher` from `@dudousxd/nestjs-inertia-codegen`. */
interface CodegenWatcher {
  close(): Promise<void>;
}

/** Minimal interface matching the codegen module's public API used here. */
interface CodegenModule {
  loadConfig(cwd?: string): Promise<unknown>;
  watch(config: unknown): Promise<CodegenWatcher>;
}

@Module({})
export class InertiaModule
  implements NestModule, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  /**
   * Shared provider set for both `forRoot` and `forRootAsync`.
   * Does NOT include the options provider(s) — callers prepend those themselves.
   */
  private static buildModuleProviders(): Provider[] {
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
          return new FileBasedShellRenderer(rv);
        }
        return new DefaultShellRenderer();
      },
    };

    const ssrProvider: Provider = {
      provide: 'INERTIA_SSR_LOADER',
      useClass: SsrLoaderService,
    };

    return [
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
    ];
  }

  private static readonly moduleExports = [
    INERTIA_MODULE_OPTIONS,
    INERTIA_MANIFEST,
    INERTIA_ASSET_VERSION,
    'INERTIA_SHELL_RENDERER',
    'INERTIA_SSR_LOADER',
    InertiaMiddleware,
  ] as const;

  static forRoot(options: InertiaModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: INERTIA_MODULE_OPTIONS,
      useValue: options,
    };

    return {
      module: InertiaModule,
      global: true,
      providers: [optionsProvider, ...InertiaModule.buildModuleProviders()],
      exports: [...InertiaModule.moduleExports],
    };
  }

  static forRootAsync(asyncOptions: InertiaModuleAsyncOptions): DynamicModule {
    InertiaModule.validateAsyncOptions(asyncOptions);

    const optionsProviders: Provider[] = InertiaModule.createAsyncOptionsProviders(asyncOptions);

    // Register inject tokens as providers so NestJS can resolve them within this module
    const injectProviders: Provider[] = (asyncOptions.inject ?? [])
      .filter((token): token is new (...args: unknown[]) => unknown => typeof token === 'function')
      .map((token) => token as unknown as Provider);

    return {
      module: InertiaModule,
      global: true,
      imports: (asyncOptions.imports as DynamicModule['imports'] | undefined) ?? [],
      providers: [...injectProviders, ...optionsProviders, ...InertiaModule.buildModuleProviders()],
      exports: [...InertiaModule.moduleExports],
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
      providers: [optionsProvider, ...InertiaModule.createFeatureProviders(options.scope)],
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

    const has = (k: 'useFactory' | 'useClass' | 'useExisting'): boolean =>
      asyncOptions[k] !== undefined;
    const declared = [has('useFactory'), has('useClass'), has('useExisting')].filter(
      Boolean,
    ).length;
    if (declared === 0) {
      throw new InvalidInertiaConfigException(
        'forFeatureAsync requires one of: useFactory, useClass, useExisting',
      );
    }
    if (declared > 1) {
      throw new InvalidInertiaConfigException(
        'forFeatureAsync accepts exactly one of: useFactory, useClass, useExisting (got multiple)',
      );
    }

    const scope = asyncOptions.scope;
    const optionsToken = featureToken('OPTIONS', scope);

    // Re-register inject tokens as providers within this module so NestJS can resolve them
    const injectProviders: Provider[] = (asyncOptions.inject ?? [])
      .filter((token): token is new (...args: unknown[]) => unknown => typeof token === 'function')
      .map((token) => token as unknown as Provider);

    let optionsProviders: Provider[];
    if (asyncOptions.useFactory) {
      optionsProviders = [
        {
          provide: optionsToken,
          useFactory: async (...args: unknown[]) => {
            const opts = await asyncOptions.useFactory!(...args);
            return { ...opts, scope };
          },
          inject: (asyncOptions.inject ?? []) as never[],
        },
      ];
    } else if (asyncOptions.useClass) {
      optionsProviders = [
        asyncOptions.useClass as unknown as Provider,
        {
          provide: optionsToken,
          useFactory: async (factory: { createInertiaOptions: () => unknown }) => ({
            ...((await factory.createInertiaOptions()) as object),
            scope,
          }),
          inject: [asyncOptions.useClass] as never[],
        },
      ];
    } else if (asyncOptions.useExisting) {
      optionsProviders = [
        {
          provide: optionsToken,
          useFactory: async (factory: { createInertiaOptions: () => unknown }) => ({
            ...((await factory.createInertiaOptions()) as object),
            scope,
          }),
          inject: [asyncOptions.useExisting] as never[],
        },
      ];
    } else {
      // unreachable — validation above ensures exactly one strategy
      optionsProviders = [];
    }

    return {
      module: InertiaModule,
      global: true,
      imports: (asyncOptions.imports as DynamicModule['imports'] | undefined) ?? [],
      providers: [
        ...injectProviders,
        ...optionsProviders,
        ...InertiaModule.createFeatureProviders(scope),
      ],
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
        useFactory: async (
          manifest: Manifest | null,
          opts: InertiaFeatureOptions,
        ): Promise<string> => {
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
    const declared = [has('useFactory'), has('useClass'), has('useExisting')].filter(
      Boolean,
    ).length;
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
      return [
        {
          provide: INERTIA_MODULE_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: (asyncOptions.inject ?? []) as never[],
        },
      ];
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

  private readonly logger = new Logger(InertiaModule.name);
  private codegenWatcher: CodegenWatcher | null = null;

  constructor(
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(INERTIA_MODULE_OPTIONS) private readonly options: InertiaModuleOptions,
    @Inject(INERTIA_ASSET_VERSION) private readonly assetVersion: string,
    @Inject(INERTIA_MANIFEST) private readonly manifest: Manifest | null,
    @Inject('INERTIA_SHELL_RENDERER') private readonly shellRenderer: ShellRenderer,
    @Inject('INERTIA_SSR_LOADER') private readonly ssrLoader: { load: () => Promise<never> },
  ) {}

  /**
   * Test seam: override in a subclass or via `Object.defineProperty` to inject a stub
   * codegen module without touching NestJS DI. Production callers never touch this.
   *
   * @internal
   */
  protected _resolveCodegenModule(): Promise<CodegenModule> {
    // Use a computed specifier so bundlers (esbuild/Vite) skip static analysis.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
    return dynamicImport('@dudousxd/nestjs-inertia-codegen') as Promise<CodegenModule>;
  }

  /**
   * Whether the codegen auto-watch is eligible to start (cheap, synchronous gates
   * only — package resolvability and config presence are checked at bootstrap).
   */
  private _codegenAutoWatchEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.NESTJS_INERTIA_DISABLE_AUTO_CODEGEN === '1') return false;
    if (this.options.codegen?.enabled === false) return false;
    return true;
  }

  /**
   * The auto-watch only starts in `onApplicationBootstrap`, so a boot that stalls
   * mid-init (hung provider factory, unreachable dependency, …) silently produces
   * no codegen output. Log a hint early so a stalled boot leaves a trace of WHY
   * the generated files haven't appeared yet.
   */
  onModuleInit(): void {
    if (!this._codegenAutoWatchEnabled()) return;
    this.logger.log(
      'Codegen auto-watch will start after application bootstrap. If this is the last codegen line you see, the app has not finished booting yet.',
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    // ── Fastify wiring (unchanged) ──────────────────────────────────────────────
    const adapter = this.httpAdapterHost.httpAdapter;
    if (adapter) {
      const platform = adapter.getType();
      if (platform === 'fastify') {
        const fastifyApp = adapter.getInstance() as unknown as Parameters<
          typeof registerFastifyInertia
        >[0];
        registerFastifyInertia(fastifyApp, () => ({
          assetVersion: this.assetVersion,
          manifest: this.manifest,
          ssrLoader: this.ssrLoader,
          rootViewRender: (ctx) => this.shellRenderer.render(ctx),
          moduleShare: this.options.share,
          featureShare: undefined,
          historyEncryptionDefault: this.options.historyEncryption?.default ?? false,
          flashStore: this.options.flashStore,
          diagnostics: this.options.diagnostics,
        }));
        // Phase 21: also register method spoof
        const { registerFastifyMethodSpoof } = await import(
          './middleware/fastify-method-spoof.middleware.js'
        );
        registerFastifyMethodSpoof(
          fastifyApp as Parameters<typeof registerFastifyMethodSpoof>[0],
          this.options,
        );
      }
    }

    // ── Codegen auto-bootstrap ──────────────────────────────────────────────────
    await this._startCodegenWatcher();
  }

  /**
   * Auto-starts the codegen file watcher in dev mode.
   *
   * Rules (all must pass for the watcher to start):
   * 1. `process.env.NODE_ENV !== 'production'`
   * 2. `options.codegen?.enabled !== false`
   * 3. `@dudousxd/nestjs-inertia-codegen` is resolvable (peer-optional)
   * 4. A `nestjs-inertia.config.ts` (or equivalent) is present in `process.cwd()`
   *
   * If the CLI watcher already holds the lock file, the codegen package returns a
   * no-op watcher — no conflict occurs.
   *
   * This method NEVER throws; any unexpected error is logged as a warning.
   */
  private async _startCodegenWatcher(): Promise<void> {
    try {
      // 1-3. Production / kill-switch env var / explicitly disabled
      if (!this._codegenAutoWatchEnabled()) return;

      // 4. Lazy-import the codegen package (peer-optional — do not fail if missing).
      //    _resolveCodegenModule() uses a cast to prevent TS from resolving the module
      //    at compile time. Override it in tests via subclass to inject a stub.
      let codegen: CodegenModule;
      try {
        codegen = await this._resolveCodegenModule();
      } catch (err: unknown) {
        // Package not installed — log warn so devs can debug unexpected import failures
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Codegen auto-watch: failed to import @dudousxd/nestjs-inertia-codegen: ${message}`,
        );
        return;
      }

      // 5. Load config — skip if no config file present, warn on other failures
      let config: unknown;
      try {
        config = await codegen.loadConfig(process.cwd());
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Codegen auto-watch: failed to load config: ${message}`);
        return;
      }

      // 6. Start the watcher (lock-file mechanism ensures a second watcher is a no-op)
      this.codegenWatcher = await codegen.watch(config);
      this.logger.log('Codegen auto-watch started (dev mode).');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Codegen auto-watch failed to start: ${message}. Install @dudousxd/nestjs-inertia-codegen and add nestjs-inertia.config.ts to enable auto-watch, or set codegen: { enabled: false } to suppress this warning.`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.codegenWatcher?.close();
    this.codegenWatcher = null;
  }

  configure(consumer: MiddlewareConsumer): void {
    const adapter = this.httpAdapterHost.httpAdapter;
    if (!adapter || adapter.getType() === 'express') {
      consumer
        .apply(MethodSpoofMiddleware)
        .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
      consumer.apply(InertiaMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
    // Fastify wiring happens in onApplicationBootstrap
  }
}
