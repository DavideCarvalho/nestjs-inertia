import { UnsupportedRootViewExtensionException } from '../errors/exceptions.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';

type Loader = () => Promise<TemplateEngineAdapter>;

const registry: Record<string, Loader> = {
  '.hbs': () => import('./handlebars.adapter.js').then((m) => m.handlebarsAdapter),
  '.handlebars': () => import('./handlebars.adapter.js').then((m) => m.handlebarsAdapter),
  '.ejs': () => import('./ejs.adapter.js').then((m) => m.ejsAdapter),
  '.pug': () => import('./pug.adapter.js').then((m) => m.pugAdapter),
  '.liquid': () => import('./liquid.adapter.js').then((m) => m.liquidAdapter),
  '.liquidjs': () => import('./liquid.adapter.js').then((m) => m.liquidAdapter),
};

export async function resolveTemplateEngine(extension: string): Promise<TemplateEngineAdapter> {
  const loader = registry[extension.toLowerCase()];
  if (!loader) {
    throw new UnsupportedRootViewExtensionException(extension);
  }
  return loader();
}
