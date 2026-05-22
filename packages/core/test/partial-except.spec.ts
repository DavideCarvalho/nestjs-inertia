import { describe, expect, it } from 'vitest';
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

describe('render — X-Inertia-Partial-Except (inverse of Partial-Data)', () => {
  it('removes listed keys from props during partial reload', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-except': 'secret,internal',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { secret: 'X', internal: 'Y', visible: 'Z' });
    const body = res._captured.body as { props: Record<string, unknown> };
    expect(body.props).not.toHaveProperty('secret');
    expect(body.props).not.toHaveProperty('internal');
    expect(body.props.visible).toBe('Z');
  });

  it('errors are kept even when in except list', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Page',
        'x-inertia-partial-except': 'errors',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { errors: { f: 'err' }, other: 'ok' });
    const body = res._captured.body as { props: Record<string, unknown> };
    expect(body.props.errors).toEqual({ f: 'err' });
  });

  it('does not apply when component does not match', async () => {
    const req = fakeRequest({
      headers: {
        'x-inertia': 'true',
        'x-inertia-partial-component': 'Other',
        'x-inertia-partial-except': 'secret',
      },
    });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, deps());
    await svc.render('Page', { secret: 'X' });
    const body = res._captured.body as { props: Record<string, unknown> };
    expect(body.props.secret).toBe('X');
  });
});
