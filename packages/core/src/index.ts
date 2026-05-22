export const VERSION = '0.0.0';
export { Inertia } from './markers.js';
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
} from './types.js';

declare global {
  namespace Express {
    interface Request {
      inertia: import('./service.js').InertiaService;
    }
  }
}
