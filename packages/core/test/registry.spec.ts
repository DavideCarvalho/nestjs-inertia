import { describe, it, expect } from 'vitest';
import type { InertiaRegistry } from '../src/index.js';

declare module '../src/index.js' {
  interface InertiaRegistry {
    pages: { Foo: { x: number } };
  }
}

describe('InertiaRegistry', () => {
  it('is augmentable and the file compiles', () => {
    type Page = InertiaRegistry['pages'];
    const _: Page = { Foo: { x: 1 } };
    expect(true).toBe(true);
  });
});
