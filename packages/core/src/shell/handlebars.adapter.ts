import { createTemplateEngineAdapter } from './create-template-engine-adapter.js';

export const handlebarsAdapter = createTemplateEngineAdapter<{
  compile: (src: string) => (locals: unknown) => string;
}>({
  extension: '.hbs',
  packageName: 'handlebars',
  displayName: 'Handlebars',
  compile(hbs, templateSource) {
    const compiled = hbs.compile(templateSource);
    return (locals) => compiled(locals);
  },
});
