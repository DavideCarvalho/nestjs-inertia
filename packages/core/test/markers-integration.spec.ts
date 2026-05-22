import { describe, it, expect } from 'vitest';
import { InertiaService } from '../src/service.js';
import { Inertia } from '../src/markers.js';
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

describe('render — Inertia v2 markers (full reload)', () => {
  it('always() resolves and appears in props', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { x: Inertia.always(() => 1) });
    expect((res._captured.body as any).props.x).toBe(1);
  });

  it('optional() does NOT resolve on full reload (no partial-data header)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', { x: Inertia.optional(() => { called = true; return 1; }) });
    expect(called).toBe(false);
    expect((res._captured.body as any).props).not.toHaveProperty('x');
  });

  it('defer() does NOT resolve; appears under deferredProps', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    let called = false;
    await svc.render('Page', {
      a: Inertia.defer(() => { called = true; return 'A'; }),
      b: Inertia.defer(() => 'B', 'secondary'),
    });
    expect(called).toBe(false);
    const body = res._captured.body as any;
    expect(body.deferredProps).toEqual({ default: ['a'], secondary: ['b'] });
    expect(body.props).not.toHaveProperty('a');
    expect(body.props).not.toHaveProperty('b');
  });

  it('merge() resolves and adds prop to mergeProps list', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { rows: Inertia.merge(() => [1, 2], { matchOn: 'id' }) });
    const body = res._captured.body as any;
    expect(body.props.rows).toEqual([1, 2]);
    expect(body.mergeProps).toEqual(['rows']);
    expect(body.matchPropsOn).toEqual({ rows: 'id' });
  });

  it('merge() with deep: true adds to deepMergeProps', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { tree: Inertia.merge(() => ({ a: 1 }), { deep: true }) });
    const body = res._captured.body as any;
    expect(body.deepMergeProps).toEqual(['tree']);
    expect(body.mergeProps).toBeUndefined();
  });
});

describe('render — partial reloads', () => {
  it('filters props NOT in X-Inertia-Partial-Data', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'stats',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { stats: { runs: 1 }, activity: 'noisy', users: [1, 2] });
    const body = res._captured.body as any;
    expect(body.props.stats).toEqual({ runs: 1 });
    expect(body.props).not.toHaveProperty('activity');
    expect(body.props).not.toHaveProperty('users');
  });

  it('ignores partial headers when component does not match', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Other',
        'x-inertia-partial-data': 'stats',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { stats: 1, activity: 2 });
    const body = res._captured.body as any;
    expect(body.props).toMatchObject({ stats: 1, activity: 2 });
  });

  it('always() still resolves under partial', async () => {
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
      stats: 1,
      ever: Inertia.always(() => 'present'),
    });
    expect((res._captured.body as any).props).toMatchObject({ stats: 1, ever: 'present' });
  });

  it('optional() resolves ONLY when listed in partial-data', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'heavy',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', {
      heavy: Inertia.optional(() => 'computed'),
      idle: Inertia.optional(() => 'no'),
    });
    const body = res._captured.body as any;
    expect(body.props.heavy).toBe('computed');
    expect(body.props).not.toHaveProperty('idle');
  });
});
