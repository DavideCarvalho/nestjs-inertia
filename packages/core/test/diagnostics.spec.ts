import diagnostics_channel from 'node:diagnostics_channel';
import { afterEach, describe, expect, it } from 'vitest';
import { INERTIA_DIAG_CHANNEL, type InertiaRenderDiagnostic } from '../src/diagnostics.js';
import { Inertia } from '../src/markers.js';
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
      flashStore: undefined,
      ...opts,
    }),
    req,
    res,
  };
}

const subscribers: ((msg: unknown) => void)[] = [];

/** Subscribe a capturing listener for the duration of one test. */
function captureEvents(): InertiaRenderDiagnostic[] {
  const events: InertiaRenderDiagnostic[] = [];
  const fn = (msg: unknown) => {
    events.push(msg as InertiaRenderDiagnostic);
  };
  diagnostics_channel.channel(INERTIA_DIAG_CHANNEL).subscribe(fn);
  subscribers.push(fn);
  return events;
}

afterEach(() => {
  for (const fn of subscribers.splice(0)) {
    diagnostics_channel.channel(INERTIA_DIAG_CHANNEL).unsubscribe(fn);
  }
});

describe('diagnostics — main path publish', () => {
  it('publishes exactly one event with the resolved page shape', async () => {
    const events = captureEvents();
    const req = fakeRequest({ headers: { 'x-inertia': 'true' }, originalUrl: '/dashboard' });
    const { svc } = makeService(req);

    await svc.render('Home', {
      hello: 'world',
      stats: Inertia.defer(async () => ({ visits: 1 })),
      list: Inertia.merge(async () => [1, 2], { matchOn: 'id' }),
      tree: Inertia.merge(async () => ({ a: 1 }), { deep: true }),
      maybe: Inertia.optional(async () => 'x'),
      seen: Inertia.once(async () => 'y'),
    });

    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.v).toBe(1);
    expect(e.component).toBe('Home');
    expect(e.url).toBe('/dashboard');
    expect(e.method).toBe('GET');
    expect(e.isInertia).toBe(true);
    expect(e.statusCode).toBe(200);
    expect(e.versionMismatch).toBe(false);
    expect(e.pageBytes).toBeGreaterThan(0);
    expect(e.props.finalKeys).toContain('hello');
    expect(e.props.finalKeys).toContain('errors');
    expect(e.props.deferred).toEqual({ default: ['stats'] });
    expect(e.props.merge).toEqual(['list']);
    expect(e.props.deepMerge).toEqual(['tree']);
    expect(e.props.matchPropsOn).toEqual({ list: 'id' });
    expect(e.props.optionalKeys).toEqual(['maybe']);
    expect(e.props.onceKeys).toEqual(['seen']);
    // resolvedProps passed by reference — the live wire object, not stringified
    expect(typeof e.resolvedProps).toBe('object');
    expect((e.resolvedProps as Record<string, unknown>).hello).toBe('world');
  });

  it('reports encryptHistory and clearHistory flags', async () => {
    const events = captureEvents();
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc } = makeService(req);
    svc.encryptHistory().clearHistory();
    await svc.render('Home', { a: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].encryptHistory).toBe(true);
    expect(events[0].clearHistory).toBe(true);
  });

  it('publishes once on the SSR/HTML (non-XHR) path with ssr flag', async () => {
    const events = captureEvents();
    const { svc } = makeService(fakeRequest(), fakeResponse(), {
      ssrLoader: { load: async () => ({ render: async () => ({ head: [], body: '<div/>' }) }) },
    });
    await svc.render('Home', { a: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].isInertia).toBe(false);
    expect(events[0].ssr).toBe(true);
    expect(events[0].pageBytes).toBeGreaterThan(0);
  });
});

describe('diagnostics — 409 version mismatch', () => {
  it('publishes a minimal mismatch event', async () => {
    const events = captureEvents();
    const req = fakeRequest({
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'old' },
      originalUrl: '/x',
    });
    const { svc, res } = makeService(req);
    await svc.render('Home', { a: 1 });
    expect(res._captured.status).toBe(409);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.versionMismatch).toBe(true);
    expect(e.statusCode).toBe(409);
    expect(e.resolvedProps).toBeUndefined();
    expect(e.clientVersion).toBe('old');
    expect(e.assetVersion).toBe('v1');
  });
});

describe('diagnostics — partial reload', () => {
  it('reports only/except and excludedKeys', async () => {
    const events = captureEvents();
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Home',
        'x-inertia-partial-data': 'keepMe',
        'x-inertia-partial-except': 'dropMe',
      },
    });
    const { svc } = makeService(req);
    await svc.render('Home', { keepMe: 1, dropMe: 2, alsoDropped: 3 });
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.isPartial).toBe(true);
    expect(e.partial.only).toEqual(['keepMe']);
    expect(e.partial.except).toEqual(['dropMe']);
    expect(e.props.finalKeys).toContain('keepMe');
    expect(e.props.finalKeys).not.toContain('dropMe');
    expect(e.props.excludedKeys).toEqual(expect.arrayContaining(['dropMe', 'alsoDropped']));
  });
});

describe('diagnostics — zero-cost when off', () => {
  it('does not publish when no subscriber', async () => {
    expect(diagnostics_channel.channel(INERTIA_DIAG_CHANNEL).hasSubscribers).toBe(false);
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc, res } = makeService(req);
    await svc.render('Home', { a: 1 });
    expect(res._captured.status).toBe(200);
  });

  it('does not publish when diagnostics: false even with a subscriber', async () => {
    const events = captureEvents();
    expect(diagnostics_channel.channel(INERTIA_DIAG_CHANNEL).hasSubscribers).toBe(true);
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const { svc } = makeService(req, fakeResponse(), { diagnostics: false });
    await svc.render('Home', { a: 1 });
    expect(events).toHaveLength(0);
  });
});
