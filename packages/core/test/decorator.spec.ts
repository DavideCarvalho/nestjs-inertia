import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { Inertia } from '../src/markers.js';
import { INERTIA_RENDER_COMPONENT } from '../src/decorator/inertia.decorator.js';

describe('@Inertia decorator + Inertia namespace coexistence', () => {
  it('Inertia(component) returns a MethodDecorator that sets metadata', () => {
    class FakeController {
      @Inertia('Home')
      show() { return { hello: 'world' }; }
    }
    const reflector = new Reflector();
    const componentName = reflector.get<string>(INERTIA_RENDER_COMPONENT, FakeController.prototype.show);
    expect(componentName).toBe('Home');
  });

  it('Inertia.always() still works as namespace method', () => {
    const m = Inertia.always(() => 1);
    expect(m).toBeDefined();
    expect((m as { kind: string }).kind).toBe('always');
  });

  it('all markers (always/optional/defer/merge/once/lazy) accessible via namespace', () => {
    expect(typeof Inertia.always).toBe('function');
    expect(typeof Inertia.optional).toBe('function');
    expect(typeof Inertia.defer).toBe('function');
    expect(typeof Inertia.merge).toBe('function');
    expect(typeof Inertia.once).toBe('function');
    expect(typeof Inertia.lazy).toBe('function');
  });
});
