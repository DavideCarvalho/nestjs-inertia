import { describe, expect, it } from 'vitest';
import { buildUrl } from '../src/fetcher/url-builder.js';

describe('buildUrl', () => {
  it('substitutes path params', () => {
    expect(buildUrl('/users/:id', { params: { id: 42 } })).toBe('/users/42');
  });
  it('appends query string', () => {
    expect(buildUrl('/users', { query: { active: true, name: 'foo' } })).toBe(
      '/users?active=true&name=foo',
    );
  });
  it('combines params + query', () => {
    expect(
      buildUrl('/teams/:tid/users/:uid', { params: { tid: 1, uid: 2 }, query: { sort: 'name' } }),
    ).toBe('/teams/1/users/2?sort=name');
  });
  it('skips undefined query values', () => {
    expect(buildUrl('/u', { query: { a: undefined, b: 1 } })).toBe('/u?b=1');
  });
  it('throws on missing param', () => {
    expect(() => buildUrl('/users/:id', { params: {} })).toThrow();
  });
  it('respects baseUrl', () => {
    expect(buildUrl('/users', {}, 'https://api.test')).toBe('https://api.test/users');
  });
});
