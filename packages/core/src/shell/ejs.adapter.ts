import { createTemplateEngineAdapter } from './create-template-engine-adapter.js';

export const ejsAdapter = createTemplateEngineAdapter<{
  compile: (src: string, opts?: unknown) => (locals: unknown) => string;
}>({
  extension: '.ejs',
  packageName: 'ejs',
  displayName: 'EJS',
  compile(ejs, templateSource, absPath) {
    const compiled = ejs.compile(templateSource, { filename: absPath, async: false });
    return (locals) => compiled(locals);
  },
});
