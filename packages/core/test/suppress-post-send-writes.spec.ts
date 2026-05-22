import { describe, it, expect, vi } from 'vitest';
import { suppressPostSendWrites } from '../src/helpers/suppress-post-send-writes.js';

function makeFakeRes(headersSent = false) {
  const calls: string[] = [];
  const res: Record<string, unknown> = {
    headersSent,
    status: vi.fn(() => { calls.push('status'); return res; }),
    json: vi.fn(() => { calls.push('json'); return res; }),
    send: vi.fn(() => { calls.push('send'); return res; }),
    header: vi.fn(() => { calls.push('header'); return res; }),
    setHeader: vi.fn(() => { calls.push('setHeader'); return res; }),
  };
  return { res, calls };
}

describe('suppressPostSendWrites', () => {
  it('passes through when headersSent is false', () => {
    const { res, calls } = makeFakeRes(false);
    suppressPostSendWrites(res as never);
    (res as any).status(200);
    (res as any).json({ ok: true });
    expect(calls).toEqual(['status', 'json']);
  });

  it('no-ops when headersSent is true', () => {
    const { res, calls } = makeFakeRes(true);
    suppressPostSendWrites(res as never);
    (res as any).status(200);
    (res as any).json({ ok: true });
    (res as any).send('x');
    (res as any).header('a', 'b');
    (res as any).setHeader('c', 'd');
    expect(calls).toEqual([]);
  });

  it('switches behavior after headersSent flips true mid-flight', () => {
    const { res, calls } = makeFakeRes(false);
    suppressPostSendWrites(res as never);
    (res as any).status(200);
    (res as any).headersSent = true;
    (res as any).json({ ok: true });
    expect(calls).toEqual(['status']);
  });

  it('returns the response itself on suppressed calls (chainability)', () => {
    const { res } = makeFakeRes(true);
    suppressPostSendWrites(res as never);
    const ret = (res as any).status(200);
    expect(ret).toBe(res);
  });
});
