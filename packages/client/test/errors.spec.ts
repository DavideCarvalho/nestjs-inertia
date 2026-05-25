import { describe, expect, it } from 'vitest';
import { ApiHttpError } from '../src/fetcher/errors.js';

describe('ApiHttpError', () => {
  it('captures status, statusText, body', async () => {
    const res = new Response(JSON.stringify({ message: 'nope' }), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'application/json' },
    });
    const err = await ApiHttpError.fromResponse(res);
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
    expect(err.body).toEqual({ message: 'nope' });
    expect(err.message).toContain('404');
  });
  it('classifies by status', () => {
    expect(new ApiHttpError(401, 'x', null).isUnauthorized).toBe(true);
    expect(new ApiHttpError(404, 'x', null).isNotFound).toBe(true);
    expect(new ApiHttpError(500, 'x', null).isServer).toBe(true);
  });

  it('isForbidden returns true for 403', () => {
    expect(new ApiHttpError(403, 'Forbidden', null).isForbidden).toBe(true);
  });

  it('isForbidden returns false for non-403', () => {
    expect(new ApiHttpError(401, 'Unauthorized', null).isForbidden).toBe(false);
    expect(new ApiHttpError(404, 'Not Found', null).isForbidden).toBe(false);
  });

  it('isClient returns true for 4xx and false for 5xx', () => {
    expect(new ApiHttpError(400, 'Bad Request', null).isClient).toBe(true);
    expect(new ApiHttpError(499, 'x', null).isClient).toBe(true);
    expect(new ApiHttpError(500, 'Internal Server Error', null).isClient).toBe(false);
    expect(new ApiHttpError(399, 'x', null).isClient).toBe(false);
  });

  it('isServer returns true for 5xx and false for 4xx', () => {
    expect(new ApiHttpError(500, 'Internal Server Error', null).isServer).toBe(true);
    expect(new ApiHttpError(503, 'Service Unavailable', null).isServer).toBe(true);
    expect(new ApiHttpError(400, 'Bad Request', null).isServer).toBe(false);
    expect(new ApiHttpError(404, 'Not Found', null).isServer).toBe(false);
  });

  it('isUnauthorized returns false for non-401', () => {
    expect(new ApiHttpError(403, 'Forbidden', null).isUnauthorized).toBe(false);
  });

  it('isNotFound returns false for non-404', () => {
    expect(new ApiHttpError(500, 'x', null).isNotFound).toBe(false);
  });

  it('fromResponse handles text/plain content type', async () => {
    const res = new Response('plain error text', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'content-type': 'text/plain' },
    });
    const err = await ApiHttpError.fromResponse(res);
    expect(err.status).toBe(500);
    expect(err.body).toBe('plain error text');
  });

  it('fromResponse handles missing content-type header', async () => {
    const res = new Response('no ct', {
      status: 502,
      statusText: 'Bad Gateway',
    });
    const err = await ApiHttpError.fromResponse(res);
    expect(err.status).toBe(502);
    expect(err.body).toBe('no ct');
  });

  it('fromResponse falls back to null when JSON parsing fails', async () => {
    const res = new Response('not valid json', {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    });
    const err = await ApiHttpError.fromResponse(res);
    expect(err.status).toBe(400);
    // json() fails on invalid JSON, falls back to null via .catch
    expect(err.body).toBeNull();
  });

  // L-5: toJSON() redacts body by default
  describe('L-5: toJSON() redacts body', () => {
    it('JSON.stringify does not contain the body', () => {
      const err = new ApiHttpError(422, 'Unprocessable', { secret: 'sensitive-data' });
      const json = JSON.stringify(err);
      expect(json).not.toContain('sensitive-data');
      expect(json).toContain('[redacted');
    });

    it('toJSON(false) redacts body (default)', () => {
      const err = new ApiHttpError(422, 'Unprocessable', { secret: 'sensitive' });
      const result = err.toJSON(false);
      expect(result.body).toBe('[redacted — pass verbose=true to include]');
    });

    it('toJSON(true) includes full body', () => {
      const err = new ApiHttpError(422, 'Unprocessable', { secret: 'sensitive' });
      const result = err.toJSON(true);
      expect(result.body).toEqual({ secret: 'sensitive' });
    });

    it('toJSON includes name, message, status, statusText', () => {
      const err = new ApiHttpError(404, 'Not Found', null);
      const result = err.toJSON();
      expect(result.name).toBe('ApiHttpError');
      expect(result.message).toContain('404');
      expect(result.status).toBe(404);
      expect(result.statusText).toBe('Not Found');
    });
  });
});
