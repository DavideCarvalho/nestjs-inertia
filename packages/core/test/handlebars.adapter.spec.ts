import { describe, it, expect } from 'vitest';
import { handlebarsAdapter } from '../src/shell/handlebars.adapter.js';

describe('handlebarsAdapter', () => {
  it('compiles a template that references locals', async () => {
    const template = '<title>{{title}}</title><body>{{{inertia}}}</body>';
    const renderer = handlebarsAdapter.compile(template, '/tmp/test.hbs');
    const out = await renderer({ title: 'Hello', inertia: '<div>X</div>' });
    expect(out).toContain('<title>Hello</title>');
    expect(out).toContain('<div>X</div>');
  });

  it('escapes HTML by default (triple-stache for raw)', async () => {
    const renderer = handlebarsAdapter.compile('<p>{{html}}</p><p>{{{raw}}}</p>', '/tmp/test.hbs');
    const out = await renderer({ html: '<b>safe</b>', raw: '<b>raw</b>' });
    expect(out).toContain('&lt;b&gt;safe&lt;/b&gt;');
    expect(out).toContain('<b>raw</b>');
  });
});
