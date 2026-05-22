export const VERSION = '0.2.0-alpha.0';
export { InertiaAuthGuard } from './guard/auth.guard.js';
export type { InertiaAuthGuardOptions } from './guard/auth.guard.js';
export { InertiaNotFoundFilter } from './filter/not-found.filter.js';
export type { InertiaNotFoundFilterOptions } from './filter/not-found.filter.js';
export { ErrorBagInterceptor } from './interceptor/error-bag.interceptor.js';
export { RedirectInterceptor } from './interceptor/redirect.interceptor.js';
export { MethodSpoofMiddleware } from './middleware/method-spoof.middleware.js';
export type { FlashStore, FlashErrors } from './flash/flash-store.js';
export {
  InvalidInertiaConfigException,
  InertiaServiceNotAvailableException,
  UnsupportedRootViewExtensionException,
} from './errors/exceptions.js';
export { Inertia } from './markers.js';
export type { InertiaRegistry } from './decorator/inertia.decorator.js';
export { INERTIA_RENDER_COMPONENT } from './decorator/inertia.decorator.js';
export { InertiaRenderInterceptor } from './interceptor/render.interceptor.js';
export type { ShellRenderer } from './shell/shell.js';
export { InertiaService } from './service.js';
export { InertiaModule } from './module.js';
export {
  INERTIA_MODULE_OPTIONS,
  INERTIA_FEATURE_OPTIONS,
  INERTIA_MANIFEST,
  INERTIA_ASSET_VERSION,
  INERTIA_DEFAULT_SCOPE,
} from './tokens.js';
export type {
  PageObject,
  SsrResult,
  Props,
  SharedFactory,
  SharedInput,
  ShellRenderCtx,
  RootView,
  RootViewFn,
  ViteOptions,
  SsrOptions,
  CodegenOptions,
  InertiaModuleOptions,
  InertiaFeatureOptions,
  InertiaOptionsFactory,
  InertiaModuleAsyncOptions,
} from './types.js';

declare global {
  namespace Express {
    interface Request {
      inertia: import('./service.js').InertiaService;
    }
  }
}
