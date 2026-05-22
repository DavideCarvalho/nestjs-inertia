import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/helpers/escape-html.js';

describe('escapeHtml', () => {
  it.each([
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['&', '&amp;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s to %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('escapes all dangerous chars in one string', () => {
    expect(escapeHtml(`<div class="x" data-x='y'>&</div>`))
      .toBe('&lt;div class=&quot;x&quot; data-x=&#39;y&#39;&gt;&amp;&lt;/div&gt;');
  });

  it('does not touch safe chars', () => {
    expect(escapeHtml('abc 123 - _ . / ? = +')).toBe('abc 123 - _ . / ? = +');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});
