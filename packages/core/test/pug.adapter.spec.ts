import { describe, expect, it } from 'vitest';
import { pugAdapter } from '../src/shell/pug.adapter.js';

describe('pugAdapter', () => {
  it('compiles a template that references locals', async () => {
    const template = 'html\n  head\n    title= title\n  body!= inertia';
    const renderer = pugAdapter.compile(template, '/tmp/test.pug');
    const out = await renderer({ title: 'Hello', inertia: '<div>X</div>' });
    expect(out).toContain('<title>Hello</title>');
    expect(out).toContain('<div>X</div>');
  });
});
