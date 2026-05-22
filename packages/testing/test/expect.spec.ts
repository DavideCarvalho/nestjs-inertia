import { describe, it, expect } from 'vitest';
import { expectInertia } from '../src/expect.js';

function buildRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    body,
    headers: { 'content-type': 'application/json', ...headers },
  };
}

describe('expectInertia — core assertions', () => {
  it('toRenderComponent passes when name matches', () => {
    const res = buildRes({ component: 'Home', props: {}, url: '/', version: 'v1' });
    expectInertia(res).toRenderComponent('Home');
  });

  it('toRenderComponent fails clearly when name differs', () => {
    const res = buildRes({ component: 'Other', props: {}, url: '/', version: 'v1' });
    expect(() => expectInertia(res).toRenderComponent('Home')).toThrow(/Other/);
  });

  it('toHaveProp with value passes on exact match', () => {
    const res = buildRes({ component: 'X', props: { user: { id: 42 } }, url: '/', version: 'v' });
    expectInertia(res).toHaveProp('user.id', 42);
  });

  it('toHaveProp without value passes when path exists', () => {
    const res = buildRes({ component: 'X', props: { user: { id: 42 } }, url: '/', version: 'v' });
    expectInertia(res).toHaveProp('user.id');
  });

  it('toHaveProp fails when value mismatch', () => {
    const res = buildRes({ component: 'X', props: { user: { id: 42 } }, url: '/', version: 'v' });
    expect(() => expectInertia(res).toHaveProp('user.id', 7)).toThrow(/7|42/);
  });

  it('toMissProp passes when path absent', () => {
    const res = buildRes({ component: 'X', props: { a: 1 }, url: '/', version: 'v' });
    expectInertia(res).toMissProp('b');
  });

  it('toHavePropMatching with regex', () => {
    const res = buildRes({ component: 'X', props: { email: 'a@b.com' }, url: '/', version: 'v' });
    expectInertia(res).toHavePropMatching('email', /@b\.com$/);
  });

  it('toHaveUrl with string and regex', () => {
    const res = buildRes({ component: 'X', props: {}, url: '/dashboard?a=1', version: 'v' });
    expectInertia(res).toHaveUrl('/dashboard?a=1');
    expectInertia(res).toHaveUrl(/dashboard/);
  });

  it('toHaveVersion with string and regex', () => {
    const res = buildRes({ component: 'X', props: {}, url: '/', version: 'abc123' });
    expectInertia(res).toHaveVersion('abc123');
    expectInertia(res).toHaveVersion(/^abc/);
  });

  it('chaining works (returns this)', () => {
    const res = buildRes({ component: 'X', props: { a: 1, b: 2 }, url: '/', version: 'v' });
    expectInertia(res)
      .toRenderComponent('X')
      .toHaveProp('a', 1)
      .toHaveProp('b', 2);
  });
});
