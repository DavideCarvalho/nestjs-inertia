export const VERSION = '0.7.0-alpha.0';
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
  MissingTemplateEngineDepException,
  MissingCookieDepException,
  InvalidCsrfTokenException,
} from './errors/exceptions.js';
export { Inertia } from './markers.js';
export { UseInertia, INERTIA_USE_SCOPE } from './decorator/use-inertia.decorator.js';
export { featureToken } from './tokens.js';
export type { InertiaRegistry, RegistryRoutes } from './types/registry.js';
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
  InertiaFeatureAsyncOptions,
} from './types.js';

export { CsrfCookieInterceptor } from './csrf/csrf-cookie.interceptor.js';
export type { CsrfCookieOptions } from './csrf/csrf-cookie.interceptor.js';
export { CsrfGuard } from './csrf/csrf.guard.js';
export type { CsrfGuardOptions } from './csrf/csrf.guard.js';
export { generateCsrfToken, verifyCsrfToken } from './csrf/csrf-token.js';

declare global {
  namespace Express {
    interface Request {
      inertia: import('./service.js').InertiaService;
    }
  }
}
