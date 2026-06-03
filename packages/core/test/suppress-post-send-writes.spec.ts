import { describe, expect, it, vi } from 'vitest';
import { suppressPostSendWrites } from '../src/helpers/suppress-post-send-writes.js';

function makeFakeRes(headersSent = false, writableEnded = false) {
  const calls: string[] = [];
  const res: Record<string, unknown> = {
    headersSent,
    writableEnded,
    status: vi.fn(() => {
      calls.push('status');
      return res;
    }),
    json: vi.fn(() => {
      calls.push('json');
      return res;
    }),
    send: vi.fn(() => {
      calls.push('send');
      return res;
    }),
    header: vi.fn(() => {
      calls.push('header');
      return res;
    }),
    setHeader: vi.fn(() => {
      calls.push('setHeader');
      return res;
    }),
    end: vi.fn(() => {
      calls.push('end');
      return res;
    }),
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

  it('no-ops header-dependent methods when headersSent is true', () => {
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

  // Streaming responses (SSE/NDJSON/downloads) flush headers first, stream
  // the body, and only then call end(). end() must therefore stay callable
  // after headersSent — gating it on headersSent left chunked responses
  // without their terminator (connection hung until proxy idle timeout).
  it('still calls end() when headersSent is true but the stream is open', () => {
    const { res, calls } = makeFakeRes(true, false);
    suppressPostSendWrites(res as never);
    (res as any).end();
    expect(calls).toEqual(['end']);
  });

  it('no-ops end() once the response has already ended (writableEnded)', () => {
    const { res, calls } = makeFakeRes(true, true);
    suppressPostSendWrites(res as never);
    (res as any).end();
    expect(calls).toEqual([]);
  });

  it('returns the response itself on a suppressed end() (chainability)', () => {
    const { res } = makeFakeRes(true, true);
    suppressPostSendWrites(res as never);
    const ret = (res as any).end();
    expect(ret).toBe(res);
  });
});
