import { describe, it, expect } from 'vitest';
import { resolveTemplateEngine } from '../src/shell/template-engine.registry.js';
import { UnsupportedRootViewExtensionException } from '../src/index.js';

describe('resolveTemplateEngine', () => {
  it('resolves .hbs to handlebars adapter', async () => {
    const adapter = await resolveTemplateEngine('.hbs');
    expect(adapter.packageName).toBe('handlebars');
  });

  it('resolves .ejs to ejs adapter', async () => {
    const adapter = await resolveTemplateEngine('.ejs');
    expect(adapter.packageName).toBe('ejs');
  });

  it('resolves .pug to pug adapter', async () => {
    const adapter = await resolveTemplateEngine('.pug');
    expect(adapter.packageName).toBe('pug');
  });

  it('resolves .liquid to liquidjs adapter', async () => {
    const adapter = await resolveTemplateEngine('.liquid');
    expect(adapter.packageName).toBe('liquidjs');
  });

  it('throws for unknown extension', async () => {
    await expect(resolveTemplateEngine('.unknown')).rejects.toThrow(UnsupportedRootViewExtensionException);
  });
});
