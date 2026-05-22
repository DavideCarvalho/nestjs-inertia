import { describe, expect, it } from 'vitest';
import { liquidAdapter } from '../src/shell/liquid.adapter.js';

describe('liquidAdapter', () => {
  it('compiles a template that references locals', async () => {
    const template = '<title>{{ title }}</title><body>{{ inertia }}</body>';
    const renderer = liquidAdapter.compile(template, '/tmp/test.liquid');
    const out = await renderer({ title: 'Hello', inertia: '<div>X</div>' });
    expect(out).toContain('<title>Hello</title>');
    // LiquidJS escapes by default
    expect(out).toMatch(/&lt;div&gt;X&lt;\/div&gt;|<div>X<\/div>/);
  });
});
