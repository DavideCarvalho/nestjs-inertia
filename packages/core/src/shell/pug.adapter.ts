import { createRequire } from 'node:module';
import { MissingTemplateEngineDepException } from '../errors/exceptions.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';

const require = createRequire(import.meta.url);

function loadPug(): { compile: (src: string, opts?: unknown) => (locals: unknown) => string } {
  try {
    return require('pug');
  } catch {
    throw new MissingTemplateEngineDepException('Pug', 'pug');
  }
}

export const pugAdapter: TemplateEngineAdapter = {
  extension: '.pug',
  packageName: 'pug',
  compile(templateSource: string, absPath: string) {
    const pug = loadPug();
    const compiled = pug.compile(templateSource, { filename: absPath });
    return (locals) => compiled(locals);
  },
};
