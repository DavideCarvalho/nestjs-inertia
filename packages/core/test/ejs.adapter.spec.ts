import { describe, it, expect } from 'vitest';
import { ejsAdapter } from '../src/shell/ejs.adapter.js';

describe('ejsAdapter', () => {
  it('compiles a template that references locals', async () => {
    const template = '<title><%= title %></title><body><%- inertia %></body>';
    const renderer = ejsAdapter.compile(template, '/tmp/test.ejs');
    const out = await renderer({ title: 'Hello', inertia: '<div>X</div>' });
    expect(out).toContain('<title>Hello</title>');
    expect(out).toContain('<div>X</div>');
  });

  it('escapes via <%= ... %> and leaves <%- ... %> raw', async () => {
    const renderer = ejsAdapter.compile('<p><%= html %></p><p><%- raw %></p>', '/tmp/test.ejs');
    const out = await renderer({ html: '<b>safe</b>', raw: '<b>raw</b>' });
    expect(out).toContain('&lt;b&gt;safe&lt;/b&gt;');
    expect(out).toContain('<b>raw</b>');
  });
});
