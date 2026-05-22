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
});
