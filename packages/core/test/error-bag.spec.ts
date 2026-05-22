import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { lastValueFrom, of } from 'rxjs';
import { ErrorBagInterceptor } from '../src/interceptor/error-bag.interceptor.js';

function makeCtx(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (n: string) => headers[n.toLowerCase()] }),
      getResponse: () => ({}),
    }),
  } as never;
}

describe('ErrorBagInterceptor', () => {
  it('passes through when X-Inertia-Error-Bag absent', async () => {
    const interceptor = new ErrorBagInterceptor();
    const value = { errors: { email: 'required' } };
    const result = await lastValueFrom(interceptor.intercept(makeCtx({}), { handle: () => of(value) }));
    expect(result).toEqual({ errors: { email: 'required' } });
  });

  it('namespaces errors under bag name when header is set', async () => {
    const interceptor = new ErrorBagInterceptor();
    const value = { errors: { email: 'required' } };
    const result = await lastValueFrom(interceptor.intercept(makeCtx({ 'x-inertia-error-bag': 'signin' }), { handle: () => of(value) }));
    expect(result).toEqual({ errors: { signin: { email: 'required' } } });
  });

  it('does not touch other props', async () => {
    const interceptor = new ErrorBagInterceptor();
    const value = { user: { id: 1 }, errors: { email: 'required' } };
    const result = await lastValueFrom(interceptor.intercept(makeCtx({ 'x-inertia-error-bag': 'bag' }), { handle: () => of(value) }));
    expect(result).toEqual({ user: { id: 1 }, errors: { bag: { email: 'required' } } });
  });

  it('skips when handler returns no `errors` field', async () => {
    const interceptor = new ErrorBagInterceptor();
    const value = { user: { id: 1 } };
    const result = await lastValueFrom(interceptor.intercept(makeCtx({ 'x-inertia-error-bag': 'bag' }), { handle: () => of(value) }));
    expect(result).toEqual({ user: { id: 1 } });
  });
});
