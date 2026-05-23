import { describe, expect, it } from 'vitest';
import { InertiaService } from '../src/service.js';
import { fakeRequest } from './helpers/fake-request.js';
import { fakeResponse } from './helpers/fake-response.js';

function makeService(
  req = fakeRequest(),
  res = fakeResponse(),
  opts: Partial<ConstructorParameters<typeof InertiaService>[2]> = {},
) {
  return {
    svc: new InertiaService(req, res, {
      assetVersion: 'v1',
      manifest: null,
      ssrLoader: { load: async () => null },
      rootViewRender: async () => '<html><body>SHELL</body></html>',
      moduleShare: undefined,
      featureShare: undefined,
      historyEncryptionDefault: false,
      ...opts,
    }),
    req,
    res,
  };
}

describe('InertiaService.render — basic CSR/SSR-off', () => {
  it('responds with JSON page object when X-Inertia: true', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    await svc.render('Home', { hello: 'world' });
    expect(res._captured.status).toBe(200);
    expect(res._captured.body).toMatchObject({
      component: 'Home',
      props: { hello: 'world', errors: {} },
      url: '/',
      version: 'v1',
    });
    expect(res._captured.headers['X-Inertia']).toBe('true');
    expect(res._captured.headers.Vary).toBe('X-Inertia');
  });

  it('responds with HTML when no X-Inertia header', async () => {
    const { svc, res } = makeService();
    await svc.render('Home');
    expect(res._captured.bodyHtml).toContain('SHELL');
  });
});

describe('InertiaService.render — version mismatch', () => {
  it('returns 409 + X-Inertia-Location when GET version differs', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' } });
    const { svc, res } = makeService(req);
    await svc.render('Home');
    expect(res._captured.status).toBe(409);
    expect(res._captured.headers['X-Inertia-Location']).toBe('/');
    expect(res._captured.ended).toBe(true);
  });

  it('does NOT 409 when versions match', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-version': 'v1' } });
    const { svc, res } = makeService(req);
    await svc.render('Home');
    expect(res._captured.status).toBe(200);
  });

  it('does NOT 409 for POST even on mismatch', async () => {
    const req = fakeRequest({
      method: 'POST',
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' },
    });
    const { svc, res } = makeService(req);
    await svc.render('Home');
    expect(res._captured.status).toBe(200);
  });

  it('does NOT 409 when X-Inertia-Version header absent (full page load)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    await svc.render('Home');
    expect(res._captured.status).toBe(200);
  });

  it('does NOT call shared/props factories when version is stale (GET)', async () => {
    let sharedCalled = false;
    let propCalled = false;
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' } });
    const { svc, res } = makeService(req, fakeResponse(), {
      moduleShare: async () => {
        sharedCalled = true;
        return {};
      },
    });
    // marker that, if invoked, would set propCalled
    const { Inertia } = await import('../src/markers.js');
    await svc.render('Home', {
      x: Inertia.always(() => {
        propCalled = true;
        return 1;
      }),
    });
    expect(res._captured.status).toBe(409);
    expect(sharedCalled).toBe(false);
    expect(propCalled).toBe(false);
  });
});

describe('InertiaService.share', () => {
  it('merges plain object shared props before render', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    svc.share({ auth: { id: '1' } });
    await svc.render('Home', { extra: true });
    expect(res._captured.body).toMatchObject({
      props: { auth: { id: '1' }, extra: true, errors: {} },
    });
  });

  it('resolves async function shared props', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    svc.share(async () => ({ flash: { msg: 'ok' } }));
    await svc.render('Home');
    expect(res._captured.body).toMatchObject({ props: { flash: { msg: 'ok' }, errors: {} } });
  });

  it('chains and accumulates multiple shares', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    svc.share({ a: 1 }).share({ b: 2 });
    await svc.render('Home');
    expect(res._captured.body).toMatchObject({ props: { a: 1, b: 2, errors: {} } });
  });

  it('local render props take priority over shared on key collision', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    svc.share({ x: 'from-shared' });
    await svc.render('Home', { x: 'from-render' });
    expect(res._captured.body).toMatchObject({ props: { x: 'from-render' } });
  });
});

describe('InertiaService.location — redirect (relative URLs)', () => {
  it('returns 409 + X-Inertia-Location for Inertia XHR with relative URL', () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    svc.location('/checkout');
    expect(res._captured.status).toBe(409);
    expect(res._captured.headers['X-Inertia-Location']).toBe('/checkout');
    expect(res._captured.ended).toBe(true);
  });
});

describe('InertiaService.location — context-aware behavior', () => {
  it('returns 302 redirect for non-Inertia browser visit', async () => {
    const req = fakeRequest({}); // no X-Inertia header
    const res = fakeResponse();
    const { svc } = makeService(req, res);
    svc.location('/checkout');
    expect(res._captured.status).toBe(302);
    expect(res._captured.headers.Location).toBe('/checkout');
    expect(res._captured.ended).toBe(true);
  });

  it('returns 409 + X-Inertia-Location for Inertia XHR (X-Inertia: true)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const { svc } = makeService(req, res);
    svc.location('/checkout');
    expect(res._captured.status).toBe(409);
    expect(res._captured.headers['X-Inertia-Location']).toBe('/checkout');
    expect(res._captured.ended).toBe(true);
  });
});

// M-3: X-Inertia-Location URL validation (open-redirect prevention)
describe('InertiaService.location — M-3: open-redirect prevention', () => {
  it('accepts relative paths', () => {
    const { svc, res } = makeService(fakeRequest({ headers: { 'x-inertia': 'true' } }));
    svc.location('/dashboard');
    expect(res._captured.headers['X-Inertia-Location']).toBe('/dashboard');
  });

  it('rejects absolute URL to external host', () => {
    const { svc } = makeService(fakeRequest({ headers: { 'x-inertia': 'true' } }));
    expect(() => svc.location('https://evil.com/steal')).toThrow('external host');
  });

  it('rejects http:// URL to external host', () => {
    const { svc } = makeService(fakeRequest({ headers: { 'x-inertia': 'true' } }));
    expect(() => svc.location('http://evil.com/steal')).toThrow('external host');
  });

  it('rejects javascript: URL (unsafe scheme)', () => {
    const { svc } = makeService(fakeRequest({ headers: { 'x-inertia': 'true' } }));
    // javascript: is a valid URL scheme but unsafe — should throw
    expect(() => svc.location('javascript:alert(1)')).toThrow();
  });
});
