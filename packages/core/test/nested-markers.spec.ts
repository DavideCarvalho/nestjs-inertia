/**
 * Tests for Inertia v3 nested marker resolution via dot-notation paths.
 *
 * v3 resolves optional/defer/merge markers at ANY nesting depth in props.
 * Partial reloads with `?only=user.profile.avatar` should walk nested markers.
 */
import { describe, expect, it } from 'vitest';
import { Inertia } from '../src/markers.js';
import { InertiaService } from '../src/service.js';
import { fakeRequest } from './helpers/fake-request.js';
import { fakeResponse } from './helpers/fake-response.js';

const deps = () => ({
  assetVersion: 'v1',
  manifest: null,
  ssrLoader: { load: async () => null },
  rootViewRender: async () => '<html/>',
  moduleShare: undefined,
  featureShare: undefined,
  historyEncryptionDefault: false,
});

// ---------------------------------------------------------------------------
// Full-reload: nested markers inside plain objects
// ---------------------------------------------------------------------------
describe('nested markers — full reload (no partial headers)', () => {
  it('always() nested inside object value resolves on full reload', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', {
      user: {
        name: 'Alice',
        token: Inertia.always(() => 'secret'),
      },
    });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect((props.user as Record<string, unknown>).name).toBe('Alice');
    expect((props.user as Record<string, unknown>).token).toBe('secret');
  });

  it('optional() nested inside object is omitted on full reload', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        avatar: Inertia.optional(() => {
          called = true;
          return 'url';
        }),
      },
    });
    expect(called).toBe(false);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    // optional nested is omitted on full reload
    expect(props.user as Record<string, unknown>).not.toHaveProperty('avatar');
    expect((props.user as Record<string, unknown>).name).toBe('Alice');
  });

  it('defer() nested inside object is omitted and registers in deferredProps on full reload', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        feed: Inertia.defer(() => {
          called = true;
          return ['post1'];
        }),
      },
    });
    expect(called).toBe(false);
    const body = res._captured.body as {
      props: Record<string, unknown>;
      deferredProps?: Record<string, string[]>;
    };
    expect(body.props.user as Record<string, unknown>).not.toHaveProperty('feed');
    // nested defer key is registered as "user.feed" in deferredProps
    expect(body.deferredProps).toEqual({ default: ['user.feed'] });
  });

  it('deeply nested always() resolves on full reload', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', {
      config: {
        auth: {
          token: Inertia.always(() => 'tok'),
        },
      },
    });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    const config = props.config as Record<string, unknown>;
    const auth = config.auth as Record<string, unknown>;
    expect(auth.token).toBe('tok');
  });
});

// ---------------------------------------------------------------------------
// Partial reload: dot-notation path resolution
// ---------------------------------------------------------------------------
describe('nested markers — partial reload with dot-notation paths', () => {
  it('optional() nested at dot-path resolves when that path is in X-Inertia-Partial-Data', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user.avatar',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        avatar: Inertia.optional(() => {
          called = true;
          return 'https://cdn.example.com/avatar.png';
        }),
      },
    });
    expect(called).toBe(true);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect((props.user as Record<string, unknown>).avatar).toBe(
      'https://cdn.example.com/avatar.png',
    );
  });

  it('optional() nested at dot-path is NOT resolved when path is absent from partial-data', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user.name',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        avatar: Inertia.optional(() => {
          called = true;
          return 'url';
        }),
      },
    });
    expect(called).toBe(false);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.user as Record<string, unknown>).not.toHaveProperty('avatar');
  });

  it('deeply nested optional() resolves via 3-segment dot-path', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user.profile.avatar',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        profile: {
          avatar: Inertia.optional(() => {
            called = true;
            return 'deep-url';
          }),
        },
      },
    });
    expect(called).toBe(true);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    const profile = (props.user as Record<string, unknown>).profile as Record<string, unknown>;
    expect(profile.avatar).toBe('deep-url');
  });

  it('defer() nested at dot-path resolves on partial reload when path is listed', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user.feed',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        feed: Inertia.defer(() => {
          called = true;
          return ['post1', 'post2'];
        }),
      },
    });
    expect(called).toBe(true);
    const body = res._captured.body as { props: Record<string, unknown>; deferredProps?: unknown };
    expect((body.props.user as Record<string, unknown>).feed).toEqual(['post1', 'post2']);
    expect(body.deferredProps).toBeUndefined();
  });

  it('top-level partial filter still works alongside nested markers', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'stats',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', {
      stats: { runs: 5 },
      user: { name: 'Alice', avatar: Inertia.optional(() => 'url') },
    });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.stats).toEqual({ runs: 5 });
    expect(props).not.toHaveProperty('user');
  });

  it('always() nested inside object always resolves even under partial', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'other',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', {
      other: 1,
      meta: { version: Inertia.always(() => '42') },
    });
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect((props.meta as Record<string, unknown>).version).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Nested once(): must mirror the top-level once() contract (resolve on a full
// reload unless the client already holds it; on a partial reload resolve only
// when its exact dot-path is requested). Regression for the bug where a nested
// once() resolved on any partial that merely included its parent.
// ---------------------------------------------------------------------------
describe('nested markers — once() mirrors top-level semantics', () => {
  it('once() nested inside object resolves on full reload', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        token: Inertia.once(() => {
          called = true;
          return 'T';
        }),
      },
    });
    expect(called).toBe(true);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect((props.user as Record<string, unknown>).token).toBe('T');
  });

  it('once() nested is OMITTED on a partial reload that includes the parent (no Reset-Once)', async () => {
    // Bug: previously resolved because the parent being fully included made
    // subKeep === null, which the resolver mistook for a full reload.
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        token: Inertia.once(() => {
          called = true;
          return 'T';
        }),
      },
    });
    expect(called).toBe(false);
    const props = (res._captured.body as { props: Record<string, unknown> }).props;
    expect(props.user as Record<string, unknown>).not.toHaveProperty('token');
    expect((props.user as Record<string, unknown>).name).toBe('Alice');
  });

  it('once() nested resolves on a partial when its full dot-path is explicitly requested', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'user.token',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      user: {
        name: 'Alice',
        token: Inertia.once(() => {
          called = true;
          return 'T-fresh';
        }),
      },
    });
    expect(called).toBe(true);
    const page = res._captured.body as {
      props: Record<string, unknown>;
      onceProps?: Record<string, { prop: string; expiresAt: number | null }>;
    };
    expect((page.props.user as Record<string, unknown>).token).toBe('T-fresh');
    expect(page.onceProps).toEqual({ 'user.token': { prop: 'user.token', expiresAt: null } });
  });
});
