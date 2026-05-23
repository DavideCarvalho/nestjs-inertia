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
