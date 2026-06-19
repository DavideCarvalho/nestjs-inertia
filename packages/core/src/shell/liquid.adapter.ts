import { createTemplateEngineAdapter } from './create-template-engine-adapter.js';

type LiquidCtor = new (
  opts?: unknown,
) => { parseAndRender: (src: string, locals: unknown) => Promise<string> };

export const liquidAdapter = createTemplateEngineAdapter<{ Liquid: LiquidCtor }>({
  extension: '.liquid',
  packageName: 'liquidjs',
  displayName: 'Liquid',
  compile(mod, templateSource) {
    const engine = new mod.Liquid({ outputEscape: 'escape' });
    return async (locals) => engine.parseAndRender(templateSource, locals);
  },
});
