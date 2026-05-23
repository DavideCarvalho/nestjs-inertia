import { describe, expect, it, vi } from 'vitest';
import { MethodSpoofMiddleware } from '../src/middleware/method-spoof.middleware.js';

function makeReq(method: string, contentType: string, body: Record<string, unknown>) {
  return { method, headers: { 'content-type': contentType }, body };
}

describe('MethodSpoofMiddleware', () => {
  it('rewrites POST + multipart + _method=PUT → PUT', () => {
    const req = makeReq('POST', 'multipart/form-data; boundary=x', { _method: 'PUT', foo: 'bar' });
    const next = vi.fn();
    const m = new MethodSpoofMiddleware({ methodSpoofing: true });
    m.use(req as never, {} as never, next);
    expect(req.method).toBe('PUT');
    expect(req.body).toEqual({ foo: 'bar' });
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(['PATCH', 'DELETE'])('rewrites POST + multipart + _method=%s', (verb) => {
    const req = makeReq('POST', 'multipart/form-data', { _method: verb });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: true }).use(req as never, {} as never, next);
    expect(req.method).toBe(verb);
  });

  it('lower-case _method values still recognized (PUT)', () => {
    const req = makeReq('POST', 'multipart/form-data', { _method: 'put' });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: true }).use(req as never, {} as never, next);
    expect(req.method).toBe('PUT');
  });

  it('does NOT touch non-POST requests', () => {
    const req = makeReq('GET', 'multipart/form-data', { _method: 'PUT' });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: true }).use(req as never, {} as never, next);
    expect(req.method).toBe('GET');
  });

  it('does NOT touch non-multipart POST', () => {
    const req = makeReq('POST', 'application/json', { _method: 'PUT' });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: true }).use(req as never, {} as never, next);
    expect(req.method).toBe('POST');
  });

  it('ignores unknown _method values (POST stays POST)', () => {
    const req = makeReq('POST', 'multipart/form-data', { _method: 'TRACE' });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: true }).use(req as never, {} as never, next);
    expect(req.method).toBe('POST');
  });

  it('does NOTHING when methodSpoofing: false', () => {
    const req = makeReq('POST', 'multipart/form-data', { _method: 'PUT' });
    const next = vi.fn();
    new MethodSpoofMiddleware({ methodSpoofing: false }).use(req as never, {} as never, next);
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ _method: 'PUT' });
  });

  // M-5: default is false (opt-in)
  it('does NOTHING when methodSpoofing is undefined (default false)', () => {
    const req = makeReq('POST', 'multipart/form-data', { _method: 'DELETE' });
    const next = vi.fn();
    new MethodSpoofMiddleware({}).use(req as never, {} as never, next);
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ _method: 'DELETE' });
  });
});
