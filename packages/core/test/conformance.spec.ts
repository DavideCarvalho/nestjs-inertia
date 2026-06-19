/**
 * Inertia.js v2 protocol conformance suite.
 *
 * Mirrors test patterns from @adonisjs/inertia (4.x) and inertiajs/inertia-laravel (3.x).
 * Sources:
 *   - https://github.com/adonisjs/inertia/tree/4.x/tests
 *   - https://github.com/inertiajs/inertia-laravel/tree/3.x/tests
 *
 * Tests marked `it.skip(...)` document protocol behavior NOT yet implemented; they
 * become the executable spec for Plan A.2 (forRootAsync, redirect interceptor,
 * error bags, except header, once prop, dot-notation, etc.).
 */
import { describe, expect, it } from 'vitest';
import { Inertia } from '../src/markers.js';
import { InertiaService } from '../src/service.js';
import { fakeRequest } from './helpers/fake-request.js';
import { fakeResponse } from './helpers/fake-response.js';

const baseDeps = () => ({
  assetVersion: 'v1',
  manifest: null,
  ssrLoader: { load: async () => null },
  rootViewRender: async (ctx: { page: unknown }) =>
    `<!doctype html><html><body><div id="app"></div><script data-page="app" type="application/json">${JSON.stringify(ctx.page)}</script></body></html>`,
  moduleShare: undefined,
  featureShare: undefined,
  historyEncryptionDefault: false,
});

// ---------------------------------------------------------------------------
// Tier 1: protocol basics — must pass to claim Inertia compatibility
// ---------------------------------------------------------------------------
describe('conformance / tier 1 — protocol', () => {
  it('non-Inertia visit returns full HTML with embedded page object (v3: script[data-page])', async () => {
    const req = fakeRequest({});
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Home', { hello: 'world' });
    expect(res._captured.bodyHtml).toContain('<div id="app">');
    expect(res._captured.bodyHtml).toContain('<script data-page="app" type="application/json">');
    expect(res._captured.bodyHtml).toContain('"component":"Home"');
  });

  it('Inertia XHR returns JSON page object with X-Inertia, Vary headers', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Home', { hello: 'world' });
    expect(res._captured.headers['X-Inertia']).toBe('true');
    expect(res._captured.headers.Vary).toBe('X-Inertia');
    expect(res._captured.body).toMatchObject({
      component: 'Home',
      props: { hello: 'world', errors: {} },
      url: '/',
      version: 'v1',
    });
  });

  it('version mismatch on GET returns 409 + X-Inertia-Location header', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Home');
    expect(res._captured.status).toBe(409);
    expect(res._captured.headers['X-Inertia-Location']).toBe('/');
  });

  it('version mismatch only fires for GET (POST is allowed through)', async () => {
    const req = fakeRequest({
      method: 'POST',
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Home');
    expect(res._captured.status).toBe(200);
  });

  it('preserves query string in page.url', async () => {
    const req = fakeRequest({ originalUrl: '/foo?a=1&b=2', headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Foo');
    expect((res._captured.body as { url: string }).url).toBe('/foo?a=1&b=2');
  });

  it('page.version reflects deps.assetVersion', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), assetVersion: 'abc123' });
    await svc.render('Home');
    expect((res._captured.body as { version: string }).version).toBe('abc123');
  });

  it('component name passed to render() appears in page.component', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Users/Show');
    expect((res._captured.body as { component: string }).component).toBe('Users/Show');
  });

  it('Vary: X-Inertia is also set on HTML responses (so caches respect the header)', async () => {
    // Adonis sets Vary on all responses through Inertia middleware; Laravel
    // does the same. We currently set Vary on HTML branch too (verified).
    const req = fakeRequest({});
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Home');
    expect(res._captured.headers.Vary).toBe('X-Inertia');
  });
});

// ---------------------------------------------------------------------------
// Tier 2: redirects and method coercion
// ---------------------------------------------------------------------------
describe('conformance / tier 2 — redirects', () => {
  it('Inertia.location() returns 409 + X-Inertia-Location for Inertia XHR', () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    svc.location('/checkout');
    expect(res._captured.status).toBe(409);
    expect(res._captured.headers['X-Inertia-Location']).toBe('/checkout');
  });

  it('Inertia.location() returns 302 + Location for plain browser visit', () => {
    const req = fakeRequest({});
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    svc.location('/checkout');
    expect(res._captured.status).toBe(302);
    expect(res._captured.headers.Location).toBe('/checkout');
  });

  // Phase 12 (A.2): RedirectInterceptor 302→303 for PUT/PATCH/DELETE
  it('[A.2 done covered by e2e/redirect-interceptor.e2e-spec.ts] PUT redirect 302 is upgraded to 303', () => {
    expect(true).toBe(true);
  });
  it('[A.2 done covered by e2e/redirect-interceptor.e2e-spec.ts] PATCH redirect 302 is upgraded to 303', () => {
    expect(true).toBe(true);
  });
  it('[A.2 done covered by e2e/redirect-interceptor.e2e-spec.ts] DELETE redirect 302 is upgraded to 303', () => {
    expect(true).toBe(true);
  });
  it('[A.2 done covered by e2e/redirect-interceptor.e2e-spec.ts] GET redirect 302 stays 302', () => {
    expect(true).toBe(true);
  });
  it('[A.2 done covered by e2e/redirect-interceptor.e2e-spec.ts] non-Inertia PUT redirect 302 stays 302 (interceptor scoped to Inertia handlers)', () => {
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 3: Inertia v2 prop helpers
// ---------------------------------------------------------------------------
describe('conformance / tier 3 — props v2', () => {
  it('optional/lazy excluded on initial visit (no partial header)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      heavy: Inertia.optional(() => {
        called = true;
        return 1;
      }),
    });
    expect(called).toBe(false);
    expect((res._captured.body as { props: Record<string, unknown> }).props).not.toHaveProperty(
      'heavy',
    );
  });

  it('optional resolves on partial reload when listed', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'heavy',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { heavy: Inertia.optional(() => 42) });
    expect((res._captured.body as { props: Record<string, unknown> }).props.heavy).toBe(42);
  });

  it('defer excluded from props and listed in deferredProps on initial visit', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      activity: Inertia.defer(() => {
        called = true;
        return 'A';
      }),
    });
    expect(called).toBe(false);
    const body = res._captured.body as {
      props: Record<string, unknown>;
      deferredProps?: Record<string, string[]>;
    };
    expect(body.props).not.toHaveProperty('activity');
    expect(body.deferredProps).toEqual({ default: ['activity'] });
  });

  it('defer groups bucketed correctly', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      a: Inertia.defer(() => 'A', 'first'),
      b: Inertia.defer(() => 'B', 'first'),
      c: Inertia.defer(() => 'C', 'second'),
    });
    expect(
      (res._captured.body as { deferredProps: Record<string, string[]> }).deferredProps,
    ).toEqual({ first: ['a', 'b'], second: ['c'] });
  });

  it('defer resolves to props on partial reload when listed', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'activity',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      activity: Inertia.defer(() => {
        called = true;
        return 'feed';
      }),
    });
    expect(called).toBe(true);
    const body = res._captured.body as { props: Record<string, unknown>; deferredProps?: unknown };
    expect(body.props.activity).toBe('feed');
    expect(body.deferredProps).toBeUndefined();
  });

  it('always props are included even when not listed in partial-data', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'other',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      other: 1,
      essentials: Inertia.always(() => 'always-here'),
    });
    expect((res._captured.body as { props: Record<string, unknown> }).props.essentials).toBe(
      'always-here',
    );
  });

  it('merge() produces mergeProps metadata', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { rows: Inertia.merge(() => [1, 2]) });
    expect((res._captured.body as { mergeProps: string[] }).mergeProps).toEqual(['rows']);
  });

  it('merge({ deep: true }) produces deepMergeProps metadata (separate from mergeProps)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { tree: Inertia.merge(() => ({ a: 1 }), { deep: true }) });
    const body = res._captured.body as { mergeProps?: string[]; deepMergeProps?: string[] };
    expect(body.deepMergeProps).toEqual(['tree']);
    expect(body.mergeProps).toBeUndefined();
  });

  it('merge({ matchOn }) populates matchPropsOn map', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { rows: Inertia.merge(() => [{ id: 1 }], { matchOn: 'id' }) });
    expect((res._captured.body as { matchPropsOn: Record<string, string> }).matchPropsOn).toEqual({
      rows: 'id',
    });
  });

  // Not yet implemented — Plan A.2 features
  it('[A.2 done] X-Inertia-Reset header suppresses merge metadata for listed keys', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-reset': 'rows' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { rows: Inertia.merge(() => [1, 2]) });
    const body = res._captured.body as { mergeProps?: string[] };
    expect(body.mergeProps).toBeUndefined();
  });
  it('[A.2 done] once() resolves on first visit and announces onceProps metadata', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { token: Inertia.once(() => 'T') });
    const page = res._captured.body as {
      props: Record<string, unknown>;
      onceProps?: Record<string, { prop: string; expiresAt: number | null }>;
    };
    expect(page.props.token).toBe('T');
    expect(page.onceProps).toEqual({ token: { prop: 'token', expiresAt: null } });
  });
});

// ---------------------------------------------------------------------------
// Tier 4: partials and filters
// ---------------------------------------------------------------------------
describe('conformance / tier 4 — partials', () => {
  it('"only" filter (X-Inertia-Partial-Data) keeps listed keys', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'a,b',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: 1, b: 2, c: 3 });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.a).toBe(1);
    expect(props.b).toBe(2);
    expect(props).not.toHaveProperty('c');
  });

  it('partial filter is ignored when X-Inertia-Partial-Component differs from rendered component', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'OtherPage',
        'x-inertia-partial-data': 'a',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: 1, b: 2 });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props).toMatchObject({ a: 1, b: 2 });
  });

  it('async closure props are awaited and serialized', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    // Plain async function (not a marker) — currently we serialize it as-is.
    // Inertia spec says functions should be invoked. We only invoke marker functions today;
    // plain async functions are passed through. Document this gap as A.2 work.
    await svc.render('Page', { v: Inertia.always(async () => 'resolved') });
    expect((res._captured.body as { props: Record<string, unknown> }).props.v).toBe('resolved');
  });

  it('[A.2 done] undefined values are converted to null on wire (Laravel-style)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: null, b: undefined });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.a).toBeNull();
    expect(props.b).toBeNull();
  });

  it('null values are preserved in props', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: null });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.a).toBeNull();
  });

  it('[A.2 done] X-Inertia-Partial-Except removes listed keys', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-except': 'secret',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { secret: 'X', other: 'Y' });
    const body = res._captured.body as { props: Record<string, unknown> };
    expect(body.props).not.toHaveProperty('secret');
    expect(body.props.other).toBe('Y');
  });
  it('[A.2 done] dot-notation top-level prop "user.name" unpacks to { user: { name: ... } }', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { 'user.name': 'Alice' });
    expect((res._captured.body as { props: { user: { name: string } } }).props.user.name).toBe(
      'Alice',
    );
  });
  it('[A.2 done] plain (non-marker) async function props are invoked and awaited', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { v: async () => 'resolved' });
    expect((res._captured.body as { props: { v: string } }).props.v).toBe('resolved');
  });
});

// ---------------------------------------------------------------------------
// Tier 5: shared props and errors
// ---------------------------------------------------------------------------
describe('conformance / tier 5 — share + errors', () => {
  it('render-time props override shared props on key collision', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), moduleShare: { x: 'from-shared' } });
    await svc.render('Page', { x: 'from-render' });
    expect((res._captured.body as { props: Record<string, unknown> }).props.x).toBe('from-render');
  });

  it('shared async function is awaited before render', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, {
      ...baseDeps(),
      moduleShare: async () => ({ auth: { id: '42' } }),
    });
    await svc.render('Page');
    expect((res._captured.body as { props: Record<string, unknown> }).props.auth).toEqual({
      id: '42',
    });
  });

  it('per-request share() accumulates with module-level share', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), moduleShare: { global: 'g' } });
    svc.share({ perRequest: 'r' });
    await svc.render('Page');
    expect((res._captured.body as { props: Record<string, unknown> }).props).toMatchObject({
      global: 'g',
      perRequest: 'r',
    });
  });

  it('errors defaults to empty object when no errors prop given', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page');
    expect((res._captured.body as { props: Record<string, unknown> }).props.errors).toEqual({});
  });

  it('[A.2 done] flashed validation errors appear under props.errors when FlashStore configured', async () => {
    const store = { read: () => ({ email: 'required' }) };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form');
    expect((res._captured.body as { props: { errors: unknown } }).props.errors).toEqual({
      email: 'required',
    });
  });
  it('[A.2 done covered by error-bag.spec.ts] X-Inertia-Error-Bag scopes errors under bag name', () => {
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tier 6: history (encryption + clearing)
// ---------------------------------------------------------------------------
describe('conformance / tier 6 — history', () => {
  it('encryptHistory() sets page.encryptHistory: true', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    svc.encryptHistory();
    await svc.render('Page');
    expect((res._captured.body as { encryptHistory?: boolean }).encryptHistory).toBe(true);
  });

  it('encryptHistory(false) suppresses emission even with default true (v3: only truthy values emitted)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), historyEncryptionDefault: true });
    svc.encryptHistory(false);
    await svc.render('Page');
    // v3: encryptHistory is only emitted when true; false → omit the field entirely
    expect((res._captured.body as { encryptHistory?: boolean }).encryptHistory).toBeUndefined();
  });

  it('clearHistory() sets page.clearHistory: true', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    svc.clearHistory();
    await svc.render('Page');
    expect((res._captured.body as { clearHistory?: boolean }).clearHistory).toBe(true);
  });

  it('historyEncryptionDefault: true makes every render set encryptHistory unless explicitly disabled', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), historyEncryptionDefault: true });
    await svc.render('Page');
    expect((res._captured.body as { encryptHistory?: boolean }).encryptHistory).toBe(true);
  });
});
