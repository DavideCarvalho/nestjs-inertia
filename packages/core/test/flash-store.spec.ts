import { describe, expect, it } from 'vitest';
import type { FlashStore } from '../src/flash/flash-store.js';
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
