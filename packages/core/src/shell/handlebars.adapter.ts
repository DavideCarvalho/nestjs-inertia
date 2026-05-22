import { createRequire } from 'node:module';
import { MissingTemplateEngineDepException } from '../errors/exceptions.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';

const require = createRequire(import.meta.url);

function loadHandlebars(): { compile: (src: string) => (locals: unknown) => string } {
  try {
    return require('handlebars');
  } catch {
    throw new MissingTemplateEngineDepException('Handlebars', 'handlebars');
  }
}

export const handlebarsAdapter: TemplateEngineAdapter = {
  extension: '.hbs',
  packageName: 'handlebars',
  compile(templateSource: string) {
    const hbs = loadHandlebars();
    const compiled = hbs.compile(templateSource);
    return (locals) => compiled(locals);
  },
};
