import { describe, expect, it } from 'vitest';
import type { FlashData, FlashStore } from '../src/flash/flash-store.js';
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

describe('FlashStore integration', () => {
  it('reads errors from FlashStore and injects into props.errors', async () => {
    const store: FlashStore = {
      read: () => ({ email: 'required' }),
    };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form');
    const body = res._captured.body as { props: { errors: Record<string, unknown> } };
    expect(body.props.errors).toEqual({ email: 'required' });
  });

  it('async read() is awaited', async () => {
    const store: FlashStore = {
      read: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return { a: 'b' };
      },
    };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form');
    expect(
      (res._captured.body as { props: { errors: Record<string, string> } }).props.errors,
    ).toEqual({ a: 'b' });
  });

  it('does not override props.errors when explicitly provided', async () => {
    const store: FlashStore = { read: () => ({ flashed: 'X' }) };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form', { errors: { explicit: 'Y' } });
    expect(
      (res._captured.body as { props: { errors: Record<string, string> } }).props.errors,
    ).toEqual({ explicit: 'Y' });
  });

  it('store throwing read() does not break render', async () => {
    const store: FlashStore = {
      read: () => {
        throw new Error('boom');
      },
    };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form');
    expect(
      (res._captured.body as { props: { errors: Record<string, unknown> } }).props.errors,
    ).toEqual({});
  });

  // L-2: flash store errors are logged (not swallowed silently)
  it('L-2: store throwing read() logs a warning (does not swallow silently)', async () => {
    const { vi } = await import('vitest');
    const { Logger } = await import('@nestjs/common');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const store: FlashStore = {
      read: () => {
        throw new Error('flash-read-error');
      },
    };
    const req = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res = fakeResponse();
    const svc = new InertiaService(req, res, { ...baseDeps(), flashStore: store });
    await svc.render('Form');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('flash-read-error'));
    warnSpy.mockRestore();
  });
});

/**
 * In-memory, consume-once flash store: `readFlash` returns the pending data and
 * clears it (Laravel/Rails semantics — flash lives for exactly the next request).
 */
function makeConsumeOnceStore() {
  let pending: FlashData = {};
  const store: FlashStore = {
    read: () => ({}),
    writeFlash: (_req, data) => {
      pending = { ...pending, ...data };
    },
    readFlash: () => {
      const out = pending;
      pending = {};
      return out;
    },
  };
  return store;
}

describe('General flash messages', () => {
  it('flashed data appears as the `flash` shared prop on the next render', async () => {
    const store = makeConsumeOnceStore();
    // Request 1: set a flash message (e.g. inside a POST handler before redirect).
    const req1 = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res1 = fakeResponse();
    const svc1 = new InertiaService(req1, res1, { ...baseDeps(), flashStore: store });
    await svc1.flash({ success: 'Saved!' });

    // Request 2: the next render surfaces the flash.
    const req2 = fakeRequest({ headers: { 'x-inertia': 'true' } });
    const res2 = fakeResponse();
    const svc2 = new InertiaService(req2, res2, { ...baseDeps(), flashStore: store });
    await svc2.render('Home');
    const body2 = res2._captured.body as { props: { flash: Record<string, unknown> } };
    expect(body2.props.flash).toEqual({ success: 'Saved!' });
  });

  it('flash is cleared after being read (gone on the following render)', async () => {
    const store = makeConsumeOnceStore();
    const svcFlash = new InertiaService(
      fakeRequest({ headers: { 'x-inertia': 'true' } }),
      fakeResponse(),
      { ...baseDeps(), flashStore: store },
    );
    await svcFlash.flash({ info: 'Heads up' });

    // First render consumes it.
    const res1 = fakeResponse();
    await new InertiaService(fakeRequest({ headers: { 'x-inertia': 'true' } }), res1, {
      ...baseDeps(),
      flashStore: store,
    }).render('Home');
    expect((res1._captured.body as { props: { flash: unknown } }).props.flash).toEqual({
      info: 'Heads up',
    });

    // Second render: flash is gone (empty object).
    const res2 = fakeResponse();
    await new InertiaService(fakeRequest({ headers: { 'x-inertia': 'true' } }), res2, {
      ...baseDeps(),
      flashStore: store,
    }).render('Home');
    expect((res2._captured.body as { props: { flash: unknown } }).props.flash).toEqual({});
  });

  it('flash(key, value) signature merges into the payload', async () => {
    const store = makeConsumeOnceStore();
    const svc = new InertiaService(
      fakeRequest({ headers: { 'x-inertia': 'true' } }),
      fakeResponse(),
      {
        ...baseDeps(),
        flashStore: store,
      },
    );
    await svc.flash('success', 'A');
    await svc.flash('info', 'B');

    const res = fakeResponse();
    await new InertiaService(fakeRequest({ headers: { 'x-inertia': 'true' } }), res, {
      ...baseDeps(),
      flashStore: store,
    }).render('Home');
    expect(
      (res._captured.body as { props: { flash: Record<string, unknown> } }).props.flash,
    ).toEqual({ success: 'A', info: 'B' });
  });

  it('flash prop defaults to {} when store has no flash data', async () => {
    const store = makeConsumeOnceStore();
    const res = fakeResponse();
    await new InertiaService(fakeRequest({ headers: { 'x-inertia': 'true' } }), res, {
      ...baseDeps(),
      flashStore: store,
    }).render('Home');
    expect((res._captured.body as { props: { flash: unknown } }).props.flash).toEqual({});
  });

  it('flash prop is absent when no flashStore is configured', async () => {
    const res = fakeResponse();
    await new InertiaService(
      fakeRequest({ headers: { 'x-inertia': 'true' } }),
      res,
      baseDeps(),
    ).render('Home');
    expect((res._captured.body as { props: Record<string, unknown> }).props).not.toHaveProperty(
      'flash',
    );
  });

  it('flash() is a no-op (does not throw) when store lacks writeFlash', async () => {
    const store: FlashStore = { read: () => ({}) };
    const svc = new InertiaService(
      fakeRequest({ headers: { 'x-inertia': 'true' } }),
      fakeResponse(),
      {
        ...baseDeps(),
        flashStore: store,
      },
    );
    await expect(svc.flash({ x: 1 })).resolves.toBeUndefined();
  });

  it('readFlash throwing does not break render (logs a warning)', async () => {
    const { vi } = await import('vitest');
    const { Logger } = await import('@nestjs/common');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const store: FlashStore = {
      read: () => ({}),
      readFlash: () => {
        throw new Error('flash-data-boom');
      },
    };
    const res = fakeResponse();
    await new InertiaService(fakeRequest({ headers: { 'x-inertia': 'true' } }), res, {
      ...baseDeps(),
      flashStore: store,
    }).render('Home');
    // render still completes; flash absent on failure
    expect((res._captured.body as { props: Record<string, unknown> }).props).not.toHaveProperty(
      'flash',
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('flash-data-boom'));
    warnSpy.mockRestore();
  });
});
