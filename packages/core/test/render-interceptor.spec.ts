import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { INERTIA_RENDER_COMPONENT } from '../src/decorator/inertia.decorator.js';
import { InertiaServiceNotAvailableException } from '../src/index.js';
import { InertiaRenderInterceptor } from '../src/interceptor/render.interceptor.js';

function makeContext(
  handler: () => unknown,
  req: unknown,
  res: unknown,
  componentMetadata: string | undefined,
) {
  const reflector = new Reflector();
  if (componentMetadata !== undefined) {
    Reflect.defineMetadata(INERTIA_RENDER_COMPONENT, componentMetadata, handler);
  }
  return {
    reflector,
    context: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => handler,
    } as never,
  };
}

describe('InertiaRenderInterceptor', () => {
  it('calls req.inertia.render(component, returnValue) when @Inertia metadata is present', async () => {
    const renderSpy = vi.fn().mockResolvedValue(undefined);
    const req = { inertia: { render: renderSpy } };
    const res = { headersSent: false };
    function handler() {
      return { hello: 'world' };
    }
    const { reflector, context } = makeContext(handler, req, res, 'Home');
    const interceptor = new InertiaRenderInterceptor(reflector);
    const result = interceptor.intercept(context, { handle: () => of({ hello: 'world' }) });
    await lastValueFrom(result, { defaultValue: undefined });
    expect(renderSpy).toHaveBeenCalledWith('Home', { hello: 'world' });
  });

  it('passes through when no @Inertia metadata', async () => {
    const req = {};
    const res = { headersSent: false };
    function handler() {
      return 'raw-value';
    }
    const { reflector, context } = makeContext(handler, req, res, undefined);
    const interceptor = new InertiaRenderInterceptor(reflector);
    const result = interceptor.intercept(context, { handle: () => of('raw-value') });
    expect(await lastValueFrom(result)).toBe('raw-value');
  });

  it('does not double-render when handler already called req.inertia.render() manually (headersSent)', async () => {
    const renderSpy = vi.fn().mockResolvedValue(undefined);
    const req = { inertia: { render: renderSpy } };
    const res = { headersSent: true };
    function handler() {
      return undefined;
    }
    const { reflector, context } = makeContext(handler, req, res, 'Home');
    const interceptor = new InertiaRenderInterceptor(reflector);
    const result = interceptor.intercept(context, { handle: () => of(undefined) });
    await lastValueFrom(result, { defaultValue: undefined });
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('throws InertiaServiceNotAvailableException when req.inertia is undefined', async () => {
    const req = {};
    const res = { headersSent: false };
    function handler() {
      return {};
    }
    const { reflector, context } = makeContext(handler, req, res, 'Home');
    const interceptor = new InertiaRenderInterceptor(reflector);
    const result = interceptor.intercept(context, { handle: () => of({}) });
    await expect(lastValueFrom(result)).rejects.toThrow(InertiaServiceNotAvailableException);
  });

  it('treats undefined return value as empty props {}', async () => {
    const renderSpy = vi.fn().mockResolvedValue(undefined);
    const req = { inertia: { render: renderSpy } };
    const res = { headersSent: false };
    function handler() {
      return undefined;
    }
    const { reflector, context } = makeContext(handler, req, res, 'Home');
    const interceptor = new InertiaRenderInterceptor(reflector);
    const result = interceptor.intercept(context, { handle: () => of(undefined) });
    await lastValueFrom(result, { defaultValue: undefined });
    expect(renderSpy).toHaveBeenCalledWith('Home', {});
  });
});
