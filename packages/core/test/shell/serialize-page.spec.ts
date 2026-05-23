import { describe, expect, it } from 'vitest';
import { serializePageData } from '../../src/shell/serialize-page.js';

describe('serializePageData', () => {
  it('round-trips: JSON.parse of output equals input', () => {
    const obj = { component: 'Home', props: { name: 'Alice', count: 42 }, url: '/', version: 'v1' };
    expect(JSON.parse(serializePageData(obj))).toEqual(obj);
  });

  it('escapes </script> so it cannot break out of a <script> tag', () => {
    const obj = { props: { bio: '</script><script>alert(1)</script>' } };
    const serialized = serializePageData(obj);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    // round-trip still works
    expect(JSON.parse(serialized)).toEqual(obj);
  });

  it('escapes <!-- (HTML comment opener)', () => {
    const obj = { props: { val: '<!--' } };
    const serialized = serializePageData(obj);
    expect(serialized).not.toContain('<!--');
    expect(JSON.parse(serialized)).toEqual(obj);
  });

  it('escapes U+2028 (line separator)', () => {
    const obj = { props: { val: ' ' } };
    const serialized = serializePageData(obj);
    expect(serialized).not.toContain(' ');
    expect(JSON.parse(serialized)).toEqual(obj);
  });

  it('escapes U+2029 (paragraph separator)', () => {
    const obj = { props: { val: ' ' } };
    const serialized = serializePageData(obj);
    expect(serialized).not.toContain(' ');
    expect(JSON.parse(serialized)).toEqual(obj);
  });

  it('renders inside an actual <script> tag without breaking out', () => {
    const obj = { props: { evil: '</script><img src=x onerror=alert(1)>' } };
    const serialized = serializePageData(obj);
    // The serialized content must not contain a literal </script> sequence
    expect(serialized).not.toMatch(/<\/script>/i);
    // Wrapping in a script tag should produce a valid structure where the content
    // between the script tags has no literal </script>
    const openTag = '<script data-page="app" type="application/json">';
    const closeTag = '</script>';
    const content = `${openTag}${serialized}${closeTag}`;
    // Extract the JSON content between the script tags
    const jsonContent = content.slice(openTag.length, content.length - closeTag.length);
    expect(jsonContent).not.toContain('</script>');
  });

  it('escapes & to prevent HTML entity confusion', () => {
    const obj = { props: { val: '&amp;' } };
    const serialized = serializePageData(obj);
    expect(serialized).not.toContain('&amp;');
    expect(JSON.parse(serialized)).toEqual(obj);
  });
});
