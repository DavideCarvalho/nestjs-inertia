import { createRequire } from 'node:module';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';
import { MissingTemplateEngineDepException } from '../errors/exceptions.js';

const require = createRequire(import.meta.url);

function loadEjs(): { compile: (src: string, opts?: unknown) => (locals: unknown) => string } {
  try {
    return require('ejs');
  } catch {
    throw new MissingTemplateEngineDepException('EJS', 'ejs');
  }
}

export const ejsAdapter: TemplateEngineAdapter = {
  extension: '.ejs',
  packageName: 'ejs',
  compile(templateSource: string, absPath: string) {
    const ejs = loadEjs();
    const compiled = ejs.compile(templateSource, { filename: absPath, async: false });
    return (locals) => compiled(locals);
  },
};
