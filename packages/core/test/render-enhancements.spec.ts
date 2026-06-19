import { describe, expect, it } from 'vitest';
import { Inertia } from '../src/markers.js';
import { InertiaService } from '../src/service.js';
import { fakeRequest } from './helpers/fake-request.js';
import { fakeResponse } from './helpers/fake-response.js';

const baseDeps = () => ({
  assetVersion: 'v1',
  manifest: null,
  ssrLoader: { load: async () => null },
  rootViewRender: async () => '<html/>',
  moduleShare: undefined,
  featureShare: undefined,
  historyEncryptionDefault: false,
});

type OncePage = {
  props: Record<string, unknown>;
  onceProps?: Record<string, { prop: string; expiresAt: number | null }>;
};

describe('render — once() marker', () => {
  it('once() resolves on a full visit and announces onceProps metadata', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      token: Inertia.once(() => {
        called = true;
        return 'T';
      }),
    });
    expect(called).toBe(true);
    const page = res._captured.body as OncePage;
    expect(page.props.token).toBe('T');
    expect(page.onceProps).toEqual({ token: { prop: 'token', expiresAt: null } });
  });

  it('once() value is skipped on a full visit when the client already holds it, but still announced', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-except-once-props': 'token' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      token: Inertia.once(() => {
        called = true;
        return 'T';
      }),
    });
    // Client reported it holds a fresh copy → server skips resolution.
    expect(called).toBe(false);
    const page = res._captured.body as OncePage;
    expect(page.props).not.toHaveProperty('token');
    // Metadata still emitted so the client knows its cache is current.
    expect(page.onceProps).toEqual({ token: { prop: 'token', expiresAt: null } });
  });

  it('once() is omitted on a partial reload that does not request it', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'other',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      other: 1,
      token: Inertia.once(() => {
        called = true;
        return 'T';
      }),
    });
    expect(called).toBe(false);
    expect((res._captured.body as OncePage).props).not.toHaveProperty('token');
  });

  it('once() resolves on a partial reload that explicitly requests it (header ignored)', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'token',
        // Even though the client claims to hold it, an explicit request wins.
        'x-inertia-except-once-props': 'token',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      other: 1,
      token: Inertia.once(() => {
        called = true;
        return 'T-fresh';
      }),
    });
    expect(called).toBe(true);
    expect((res._captured.body as OncePage).props.token).toBe('T-fresh');
  });

  it('once() supports a custom cache key and expiresAt', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      lookups: Inertia.once(() => ['a', 'b'], { key: 'enums', expiresAt: 1718700000000 }),
    });
    const page = res._captured.body as OncePage;
    expect(page.props.lookups).toEqual(['a', 'b']);
    expect(page.onceProps).toEqual({ enums: { prop: 'lookups', expiresAt: 1718700000000 } });
  });

  it('once() honors the custom cache key in X-Inertia-Except-Once-Props', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-except-once-props': 'enums' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      lookups: Inertia.once(
        () => {
          called = true;
          return ['a'];
        },
        { key: 'enums' },
      ),
    });
    expect(called).toBe(false);
    const page = res._captured.body as OncePage;
    expect(page.props).not.toHaveProperty('lookups');
    expect(page.onceProps).toEqual({ enums: { prop: 'lookups', expiresAt: null } });
  });
});

describe('render — undefined → null wire conversion', () => {
  it('converts undefined props to null', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: undefined, b: 1 });
    const body = res._captured.body as { props: Record<string, unknown> };
    expect(body.props.a).toBeNull();
    expect(body.props.b).toBe(1);
  });

  it('preserves null as null', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { a: null });
    expect((res._captured.body as { props: Record<string, unknown> }).props.a).toBeNull();
  });
});

describe('render — plain async function props', () => {
  it('awaits a plain async function prop (not a marker)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { val: async () => 'resolved' });
    expect((res._captured.body as { props: Record<string, unknown> }).props.val).toBe('resolved');
  });

  it('awaits a plain sync function prop', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { val: () => 42 });
    expect((res._captured.body as { props: Record<string, unknown> }).props.val).toBe(42);
  });
});

describe('render — dot-notation unpacking', () => {
  it('unpacks single-level dot key', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { 'user.name': 'Alice' });
    const body = res._captured.body as { props: Record<string, Record<string, unknown>> };
    expect(body.props.user).toEqual({ name: 'Alice' });
  });

  it('unpacks multiple dot keys with shared prefix', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { 'user.name': 'A', 'user.age': 30 });
    const body = res._captured.body as { props: Record<string, Record<string, unknown>> };
    expect(body.props.user).toEqual({ name: 'A', age: 30 });
  });

  it('does not unpack nested dots inside marker values', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { 'config.x': Inertia.always(() => 'never-unpacked-inside') });
    const body = res._captured.body as { props: Record<string, Record<string, unknown>> };
    expect(body.props.config).toEqual({ x: 'never-unpacked-inside' });
  });
});

describe('render — X-Inertia-Reset header (suppresses merge metadata)', () => {
  it('removes key from mergeProps when X-Inertia-Reset lists it', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-reset': 'rows' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { rows: Inertia.merge(() => [1, 2]) });
    const body = res._captured.body as { mergeProps?: string[]; props: Record<string, unknown> };
    expect(body.props.rows).toEqual([1, 2]);
    expect(body.mergeProps).toBeUndefined();
  });

  it('removes key from deepMergeProps when X-Inertia-Reset lists it', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-reset': 'tree' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { tree: Inertia.merge(() => ({ a: 1 }), { deep: true }) });
    expect((res._captured.body as { deepMergeProps?: string[] }).deepMergeProps).toBeUndefined();
  });

  it('value still resolves and appears in props', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-reset': 'rows' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      rows: Inertia.merge(() => {
        called = true;
        return [9, 8];
      }),
    });
    expect(called).toBe(true);
    expect((res._captured.body as { props: Record<string, unknown> }).props.rows).toEqual([9, 8]);
  });
});

describe('render — scroll() infinite-scroll marker', () => {
  type ScrollPage = {
    props: Record<string, unknown>;
    mergeProps?: string[];
    prependProps?: string[];
    matchPropsOn?: Record<string, string | string[]>;
    scrollProps?: Record<
      string,
      {
        pageName: string;
        currentPage: unknown;
        nextPage: unknown;
        previousPage: unknown;
        reset: boolean;
      }
    >;
  };

  const paginator = () => ({
    data: [{ id: 1 }, { id: 2 }],
    pageName: 'page',
    currentPage: 2,
    nextPage: 3,
    previousPage: 1,
  });

  it('emits a scrollProps cursor and labels <path>.data for append merge on a full visit', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { users: Inertia.scroll(() => paginator()) });
    const page = res._captured.body as ScrollPage;
    expect((page.props.users as { data: unknown[] }).data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(page.mergeProps).toEqual(['users.data']);
    expect(page.scrollProps).toEqual({
      users: { pageName: 'page', currentPage: 2, nextPage: 3, previousPage: 1, reset: false },
    });
  });

  it('emits matchPropsOn for keyed dedup on <path>.data', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { users: Inertia.scroll(() => paginator(), { matchOn: 'id' }) });
    const page = res._captured.body as ScrollPage;
    expect(page.matchPropsOn).toEqual({ 'users.data': 'id' });
  });

  it('prepends when X-Inertia-Infinite-Scroll-Merge-Intent is "prepend"', async () => {
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-infinite-scroll-merge-intent': 'prepend' },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { users: Inertia.scroll(() => paginator()) });
    const page = res._captured.body as ScrollPage;
    expect(page.prependProps).toEqual(['users.data']);
    expect(page.mergeProps).toBeUndefined();
  });

  it('on X-Inertia-Reset: sends data unlabeled and sets scrollProps.reset = true', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-reset': 'users' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { users: Inertia.scroll(() => paginator()) });
    const page = res._captured.body as ScrollPage;
    expect(page.mergeProps).toBeUndefined();
    expect(page.prependProps).toBeUndefined();
    expect(page.scrollProps?.users.reset).toBe(true);
  });

  it('respects pageName override and defaults missing cursors to null', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      users: Inertia.scroll(() => ({ data: [], currentPage: 1 }), { pageName: 'cursor' }),
    });
    const page = res._captured.body as ScrollPage;
    expect(page.scrollProps).toEqual({
      users: {
        pageName: 'cursor',
        currentPage: 1,
        nextPage: null,
        previousPage: null,
        reset: false,
      },
    });
  });

  it('is omitted on a partial reload that does not request it', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'other',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      other: 1,
      users: Inertia.scroll(() => {
        called = true;
        return paginator();
      }),
    });
    expect(called).toBe(false);
    const page = res._captured.body as ScrollPage;
    expect(page.props).not.toHaveProperty('users');
    expect(page.scrollProps).toBeUndefined();
  });

  it('resolves on a partial reload that requests it', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'users',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { other: 1, users: Inertia.scroll(() => paginator()) });
    const page = res._captured.body as ScrollPage;
    expect((page.props.users as { data: unknown[] }).data).toHaveLength(2);
    expect(page.scrollProps?.users.nextPage).toBe(3);
    expect(page.mergeProps).toEqual(['users.data']);
  });

  it('deferred scroll: full visit announces in deferredProps + labels data, but sends no value or cursor', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      users: Inertia.scroll(
        () => {
          called = true;
          return paginator();
        },
        { defer: true },
      ),
    });
    expect(called).toBe(false);
    const page = res._captured.body as ScrollPage & { deferredProps?: Record<string, string[]> };
    expect(page.props).not.toHaveProperty('users');
    expect(page.deferredProps).toEqual({ default: ['users'] });
    // Merge label is still emitted on the full visit so the client knows the merge plan.
    expect(page.mergeProps).toEqual(['users.data']);
    // No cursor until the deferred partial reload resolves it.
    expect(page.scrollProps).toBeUndefined();
  });

  it('deferred scroll: partial reload resolves the value and emits the cursor', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'users',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      users: Inertia.scroll(() => paginator(), { defer: true }),
    });
    const page = res._captured.body as ScrollPage & { deferredProps?: Record<string, string[]> };
    expect((page.props.users as { data: unknown[] }).data).toHaveLength(2);
    expect(page.scrollProps?.users.nextPage).toBe(3);
    expect(page.mergeProps).toEqual(['users.data']);
    expect(page.deferredProps).toBeUndefined();
  });

  it('deferred scroll honors a custom group', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      users: Inertia.scroll(() => paginator(), { defer: true, group: 'feed' }),
    });
    const page = res._captured.body as { deferredProps?: Record<string, string[]> };
    expect(page.deferredProps).toEqual({ feed: ['users'] });
  });
});

describe('render — defer({ rescue: true }) → rescuedProps', () => {
  const partialReq = () =>
    fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'stats',
      },
    });

  it('omits the prop and lists it in rescuedProps when a rescued deferred resolver throws', async () => {
    const res = fakeResponse();
    const svc = new InertiaService(partialReq(), res, baseDeps());
    await svc.render('Page', {
      other: 1,
      stats: Inertia.defer(
        () => {
          throw new Error('boom');
        },
        { rescue: true },
      ),
    });
    const body = res._captured.body as {
      props: Record<string, unknown>;
      rescuedProps?: string[];
    };
    expect(body.props).not.toHaveProperty('stats');
    expect(body.rescuedProps).toEqual(['stats']);
  });

  it('sends the value and emits no rescuedProps when a rescued deferred resolver succeeds', async () => {
    const res = fakeResponse();
    const svc = new InertiaService(partialReq(), res, baseDeps());
    await svc.render('Page', {
      stats: Inertia.defer(() => 'OK', { rescue: true }),
    });
    const body = res._captured.body as {
      props: Record<string, unknown>;
      rescuedProps?: string[];
    };
    expect(body.props.stats).toBe('OK');
    expect(body.rescuedProps).toBeUndefined();
  });

  it('propagates the error when a non-rescued deferred resolver throws', async () => {
    const res = fakeResponse();
    const svc = new InertiaService(partialReq(), res, baseDeps());
    await expect(
      svc.render('Page', {
        stats: Inertia.defer(() => {
          throw new Error('boom');
        }),
      }),
    ).rejects.toThrow('boom');
  });

  it('does not attempt rescue on a full visit (deferred is only announced)', async () => {
    const res = fakeResponse();
    const svc = new InertiaService(
      fakeRequest({ headers: { 'x-inertia': 'true' } }),
      res,
      baseDeps(),
    );
    let called = false;
    await svc.render('Page', {
      stats: Inertia.defer(
        () => {
          called = true;
          throw new Error('boom');
        },
        { rescue: true },
      ),
    });
    expect(called).toBe(false);
    const body = res._captured.body as {
      deferredProps?: Record<string, string[]>;
      rescuedProps?: string[];
    };
    expect(body.deferredProps).toEqual({ default: ['stats'] });
    expect(body.rescuedProps).toBeUndefined();
  });
});

describe('render — merge({ prepend: true }) → prependProps', () => {
  it('emits the key in prependProps (not mergeProps) and resolves the value', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { feed: Inertia.merge(() => [1, 2], { prepend: true }) });
    const body = res._captured.body as {
      props: Record<string, unknown>;
      mergeProps?: string[];
      prependProps?: string[];
    };
    expect(body.props.feed).toEqual([1, 2]);
    expect(body.prependProps).toEqual(['feed']);
    expect(body.mergeProps).toBeUndefined();
  });

  it('carries matchPropsOn for keyed prepend dedup', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', {
      feed: Inertia.merge(() => [{ id: 1 }], { prepend: true, matchOn: 'id' }),
    });
    const body = res._captured.body as {
      prependProps?: string[];
      matchPropsOn?: Record<string, string | string[]>;
    };
    expect(body.prependProps).toEqual(['feed']);
    expect(body.matchPropsOn).toEqual({ feed: 'id' });
  });

  it('X-Inertia-Reset suppresses prependProps metadata but keeps the value', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true', 'x-inertia-reset': 'feed' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    await svc.render('Page', { feed: Inertia.merge(() => [3], { prepend: true }) });
    const body = res._captured.body as {
      props: Record<string, unknown>;
      prependProps?: string[];
    };
    expect(body.props.feed).toEqual([3]);
    expect(body.prependProps).toBeUndefined();
  });
});
