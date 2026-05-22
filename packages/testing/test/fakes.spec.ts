import { describe, expect, it } from 'vitest';
import { createFakeInertiaRequest } from '../src/fakes/fake-request.js';
import { createFakeInertiaResponse } from '../src/fakes/fake-response.js';

describe('createFakeInertiaRequest', () => {
  it('returns sensible defaults', () => {
    const req = createFakeInertiaRequest();
    expect(req.method).toBe('GET');
    expect(req.url).toBe('/');
    expect(req.originalUrl).toBe('/');
  });

  it('respects overrides', () => {
    const req = createFakeInertiaRequest({
      method: 'POST',
      url: '/foo',
      headers: { 'x-inertia': 'true' },
    });
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/foo');
    expect(req.header('X-Inertia')).toBe('true');
    expect(req.header('x-inertia')).toBe('true');
  });
});

describe('createFakeInertiaResponse', () => {
  it('json sets body and headersSent', () => {
    const res = createFakeInertiaResponse();
    res.status(409).json({ ok: true });
    expect(res.statusCode).toBe(409);
    expect(res._captured.body).toEqual({ ok: true });
    expect(res.headersSent).toBe(true);
  });

  it('setHeader writes headers', () => {
    const res = createFakeInertiaResponse();
    res.setHeader('X-Inertia-Location', '/signin');
    expect(res._captured.headers['X-Inertia-Location']).toBe('/signin');
  });

  it('html sets bodyHtml', () => {
    const res = createFakeInertiaResponse();
    res.html('<div>X</div>');
    expect(res._captured.bodyHtml).toBe('<div>X</div>');
  });

  it('end sets ended flag', () => {
    const res = createFakeInertiaResponse();
    res.end();
    expect(res._captured.ended).toBe(true);
    expect(res.headersSent).toBe(true);
  });
});
