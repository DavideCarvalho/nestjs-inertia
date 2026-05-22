import { describe, it, expect } from 'vitest';
import { InertiaService } from '../src/service.js';
import { Inertia } from '../src/markers.js';
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

describe('render — once() marker', () => {
  it('once() resolves on initial visit (no Reset-Once header)', async () => {
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', { token: Inertia.once(() => { called = true; return 'T'; }) });
    expect(called).toBe(true);
    expect((res._captured.body as { props: Record<string, unknown> }).props.token).toBe('T');
  });

  it('once() is OMITTED on partial reload without Reset-Once header', async () => {
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
      token: Inertia.once(() => { called = true; return 'T'; }),
    });
    expect(called).toBe(false);
    expect((res._captured.body as { props: Record<string, unknown> }).props).not.toHaveProperty('token');
  });

  it('once() resolves when X-Inertia-Reset-Once lists the key', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-data': 'other',
        'x-inertia-reset-once': 'token',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, baseDeps());
    let called = false;
    await svc.render('Page', {
      other: 1,
      token: Inertia.once(() => { called = true; return 'T-fresh'; }),
    });
    expect(called).toBe(true);
    expect((res._captured.body as { props: Record<string, unknown> }).props.token).toBe('T-fresh');
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
    await svc.render('Page', { rows: Inertia.merge(() => { called = true; return [9, 8]; }) });
    expect(called).toBe(true);
    expect((res._captured.body as { props: Record<string, unknown> }).props.rows).toEqual([9, 8]);
  });
});
