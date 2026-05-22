import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { UseInertia, INERTIA_USE_SCOPE } from '../src/decorator/use-inertia.decorator.js';

describe('@UseInertia decorator', () => {
  it('sets scope metadata on method', () => {
    class Ctrl {
      @UseInertia('admin')
      show() {}
    }
    const reflector = new Reflector();
    const scope = reflector.get<string>(INERTIA_USE_SCOPE, Ctrl.prototype.show);
    expect(scope).toBe('admin');
  });

  it('sets scope metadata on class', () => {
    @UseInertia('portal')
    class Ctrl {}
    const reflector = new Reflector();
    const scope = reflector.get<string>(INERTIA_USE_SCOPE, Ctrl);
    expect(scope).toBe('portal');
  });
});
