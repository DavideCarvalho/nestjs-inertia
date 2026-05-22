import { describe, expect, it } from 'vitest';
import { assertInertia } from '../src/assert.js';

describe('assertInertia', () => {
  it('toRenderComponent passes on match', () => {
    assertInertia({ component: 'X', props: {}, url: '/', version: 'v' }).toRenderComponent('X');
  });

  it('toRenderComponent throws on mismatch', () => {
    expect(() =>
      assertInertia({ component: 'X', props: {}, url: '/', version: 'v' }).toRenderComponent('Y'),
    ).toThrow();
  });
});
