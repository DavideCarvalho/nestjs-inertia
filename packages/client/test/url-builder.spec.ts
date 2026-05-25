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

  it('URL-encodes path params containing slashes (foo/bar)', () => {
    expect(buildUrl('/users/:id', { params: { id: 'foo/bar' } })).toBe('/users/foo%2Fbar');
  });

  it('URL-encodes path traversal in params (../admin)', () => {
    expect(buildUrl('/users/:id', { params: { id: '../admin' } })).toBe('/users/..%2Fadmin');
  });

  it('normalizes path that does not start with /', () => {
    expect(buildUrl('users', {})).toBe('/users');
  });

  it('normalizes path without / when combined with params and query', () => {
    expect(buildUrl('users/:id', { params: { id: 7 }, query: { v: 1 } })).toBe('/users/7?v=1');
  });

  it('throws on null param value', () => {
    expect(() => buildUrl('/users/:id', { params: { id: null } })).toThrow('Missing param: id');
  });

  it('strips trailing slash from baseUrl', () => {
    expect(buildUrl('/users', {}, 'https://api.test/')).toBe('https://api.test/users');
  });

  it('handles baseUrl with trailing slash and path without leading slash', () => {
    expect(buildUrl('items', {}, 'https://api.test/')).toBe('https://api.test/items');
  });

  it('works with empty opts (default parameter)', () => {
    expect(buildUrl('/simple')).toBe('/simple');
  });

  it('skips query string when opts.query is not provided', () => {
    expect(buildUrl('/users/:id', { params: { id: 5 } })).toBe('/users/5');
  });

  it('skips query string when all query values are undefined', () => {
    expect(buildUrl('/users', { query: { a: undefined, b: undefined } })).toBe('/users');
  });
});
