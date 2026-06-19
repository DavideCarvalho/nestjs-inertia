import { describe, expect, it } from 'vitest';
import { markServerRendered } from '../../src/shell/mark-server-rendered.js';

describe('markServerRendered', () => {
  it('adds data-server-rendered="true" to the #app mount', () => {
    expect(markServerRendered('<div id="app">APP</div>')).toBe(
      '<div id="app" data-server-rendered="true">APP</div>',
    );
  });

  it('is idempotent when the attribute is already present', () => {
    const already = '<div id="app" data-server-rendered="true">APP</div>';
    expect(markServerRendered(already)).toBe(already);
  });

  it('preserves other attributes on the mount element', () => {
    expect(markServerRendered('<div class="x" id="app" data-c="Home">B</div>')).toBe(
      '<div class="x" id="app" data-server-rendered="true" data-c="Home">B</div>',
    );
  });

  it('supports single-quoted id', () => {
    expect(markServerRendered("<div id='app'>B</div>")).toBe(
      `<div id='app' data-server-rendered="true">B</div>`,
    );
  });

  it('leaves a body without an #app mount unchanged', () => {
    expect(markServerRendered('<div id="root">B</div>')).toBe('<div id="root">B</div>');
  });
});
