import { describe, it, expect } from 'vitest';
import '../src/vitest.js';

describe('Vitest expect.extend integration', () => {
  it('toRenderInertiaComponent matcher works', () => {
    const res = { status: 200, body: { component: 'X', props: {}, url: '/', version: 'v' }, headers: {} };
    expect(res).toRenderInertiaComponent('X');
  });

  it('toHaveInertiaProp matcher works', () => {
    const res = { status: 200, body: { component: 'X', props: { a: 1 }, url: '/', version: 'v' }, headers: {} };
    expect(res).toHaveInertiaProp('a', 1);
  });

  it('failure produces useful message', () => {
    const res = { status: 200, body: { component: 'X', props: {}, url: '/', version: 'v' }, headers: {} };
    expect(() => expect(res).toRenderInertiaComponent('Y')).toThrow(/Y|X/);
  });
});
