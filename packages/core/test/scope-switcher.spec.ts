import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ModuleRef } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { InertiaScopeSwitcherInterceptor } from '../src/interceptor/scope-switcher.interceptor.js';
import { UseInertia } from '../src/decorator/use-inertia.decorator.js';
import { featureToken } from '../src/tokens.js';

describe('InertiaScopeSwitcherInterceptor', () => {
  it('passes through when no @UseInertia metadata', async () => {
    const reflector = new Reflector();
    const moduleRef = { get: vi.fn() } as unknown as ModuleRef;
    function handler() {}
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ inertia: 'default' }), getResponse: () => ({}) }),
      getHandler: () => handler,
      getClass: () => class {},
    } as never;
    const interceptor = new InertiaScopeSwitcherInterceptor(reflector, moduleRef);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('passed') }), { defaultValue: undefined });
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('passes through when scope is "default"', async () => {
    const reflector = new Reflector();
    const moduleRef = { get: vi.fn() } as unknown as ModuleRef;
    @UseInertia('default')
    class Ctrl { show() {} }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ inertia: 'default' }), getResponse: () => ({}) }),
      getHandler: () => Ctrl.prototype.show,
      getClass: () => Ctrl,
    } as never;
    const interceptor = new InertiaScopeSwitcherInterceptor(reflector, moduleRef);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('passed') }), { defaultValue: undefined });
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('replaces req.inertia with a scoped service when scope is non-default', async () => {
    const reflector = new Reflector();
    const moduleRef = {
      get: vi.fn((token) => {
        if (token === featureToken('OPTIONS', 'admin')) return { scope: 'admin', historyEncryption: { default: false }, share: undefined, flashStore: undefined };
        if (token === featureToken('MANIFEST', 'admin')) return null;
        if (token === featureToken('ASSET_VERSION', 'admin')) return 'admin-v';
        if (token === featureToken('SHELL_RENDERER', 'admin')) return { render: async () => '<html/>' };
        if (token === featureToken('SSR_LOADER', 'admin')) return { load: async () => null };
        return undefined;
      }),
    } as unknown as ModuleRef;
    class Ctrl {
      @UseInertia('admin')
      show() {}
    }
    const req = { inertia: 'default', headers: {}, method: 'GET', originalUrl: '/admin', url: '/admin' };
    const res = { statusCode: 200, headersSent: false };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => Ctrl.prototype.show,
      getClass: () => Ctrl,
    } as never;
    const interceptor = new InertiaScopeSwitcherInterceptor(reflector, moduleRef);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('done') }), { defaultValue: undefined });
    expect(typeof req.inertia as unknown).toBe('object');
    expect(moduleRef.get).toHaveBeenCalledWith(featureToken('OPTIONS', 'admin'), expect.objectContaining({ strict: false }));
  });
});
