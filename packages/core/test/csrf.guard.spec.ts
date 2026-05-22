import { describe, expect, it } from 'vitest';
import { generateCsrfToken } from '../src/csrf/csrf-token.js';
import { CsrfGuard } from '../src/csrf/csrf.guard.js';
import { InvalidCsrfTokenException } from '../src/index.js';

function makeCtx(req: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as never;
}

describe('CsrfGuard', () => {
  it('passes safe GET requests', () => {
    const guard = new CsrfGuard({ secret: 'shh' });
    const ctx = makeCtx({ method: 'GET', cookies: {}, headers: {} });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when valid header matches valid cookie', () => {
    const token = generateCsrfToken('shh');
    const guard = new CsrfGuard({ secret: 'shh' });
    const ctx = makeCtx({
      method: 'POST',
      cookies: { 'XSRF-TOKEN': token },
      headers: { 'x-xsrf-token': token },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws InvalidCsrfTokenException when header missing on POST', () => {
    const guard = new CsrfGuard({ secret: 'shh' });
    const ctx = makeCtx({ method: 'POST', cookies: { 'XSRF-TOKEN': 'x.y' }, headers: {} });
    expect(() => guard.canActivate(ctx)).toThrow(InvalidCsrfTokenException);
  });

  it('throws when header does not match cookie', () => {
    const a = generateCsrfToken('shh');
    const b = generateCsrfToken('shh');
    const guard = new CsrfGuard({ secret: 'shh' });
    const ctx = makeCtx({
      method: 'POST',
      cookies: { 'XSRF-TOKEN': a },
      headers: { 'x-xsrf-token': b },
    });
    expect(() => guard.canActivate(ctx)).toThrow(InvalidCsrfTokenException);
  });

  it('throws when cookie token signature is invalid', () => {
    const guard = new CsrfGuard({ secret: 'shh' });
    const ctx = makeCtx({
      method: 'POST',
      cookies: { 'XSRF-TOKEN': 'fake.token' },
      headers: { 'x-xsrf-token': 'fake.token' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(InvalidCsrfTokenException);
  });
});
