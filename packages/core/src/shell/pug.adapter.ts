import { createTemplateEngineAdapter } from './create-template-engine-adapter.js';

export const pugAdapter = createTemplateEngineAdapter<{
  compile: (src: string, opts?: unknown) => (locals: unknown) => string;
}>({
  extension: '.pug',
  packageName: 'pug',
  displayName: 'Pug',
  compile(pug, templateSource, absPath) {
    const compiled = pug.compile(templateSource, { filename: absPath });
    return (locals) => compiled(locals);
  },
});
