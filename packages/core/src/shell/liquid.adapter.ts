import { createRequire } from 'node:module';
import { MissingTemplateEngineDepException } from '../errors/exceptions.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';

const require = createRequire(import.meta.url);

type LiquidCtor = new (
  opts?: unknown,
) => { parseAndRender: (src: string, locals: unknown) => Promise<string> };

function loadLiquid(): LiquidCtor {
  try {
    const mod = require('liquidjs');
    return mod.Liquid as LiquidCtor;
  } catch {
    throw new MissingTemplateEngineDepException('Liquid', 'liquidjs');
  }
}

export const liquidAdapter: TemplateEngineAdapter = {
  extension: '.liquid',
  packageName: 'liquidjs',
  compile(templateSource: string) {
    const Liquid = loadLiquid();
    const engine = new Liquid({ outputEscape: 'escape' });
    return async (locals) => engine.parseAndRender(templateSource, locals);
  },
};
