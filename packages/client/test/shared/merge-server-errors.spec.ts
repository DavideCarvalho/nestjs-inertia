import { describe, expect, it, vi } from 'vitest';
import { mergeServerErrors } from '../../src/shared/merge-server-errors.js';

describe('mergeServerErrors', () => {
  it('applies each field message via setError', () => {
    const setError = vi.fn();
    const result = mergeServerErrors(
      { email: 'Invalid email', password: 'Too short' },
      undefined,
      setError,
    );
    expect(setError).toHaveBeenCalledWith('email', 'Invalid email');
    expect(setError).toHaveBeenCalledWith('password', 'Too short');
    expect(result.applied).toEqual(['email', 'password']);
    expect(result.formError).toBeUndefined();
  });

  it('scopes to the error bag when set', () => {
    const setError = vi.fn();
    const result = mergeServerErrors(
      { login: { email: 'bad' }, edit: { title: 'nope' } },
      'login',
      setError,
    );
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', 'bad');
    expect(result.applied).toEqual(['email']);
  });

  it('aggregates the `_` key into formError', () => {
    const setError = vi.fn();
    const result = mergeServerErrors({ _: 'Something went wrong' }, undefined, setError);
    expect(setError).not.toHaveBeenCalled();
    expect(result.formError).toBe('Something went wrong');
  });

  it('aggregates unknown keys (not in knownFields) into formError', () => {
    const setError = vi.fn();
    const known = new Set(['email']);
    const result = mergeServerErrors(
      { email: 'bad', serverOnly: 'uniqueness failed' },
      undefined,
      setError,
      known,
    );
    expect(setError).toHaveBeenCalledWith('email', 'bad');
    expect(setError).not.toHaveBeenCalledWith('serverOnly', expect.anything());
    expect(result.formError).toBe('uniqueness failed');
  });

  it('reads array message values (first element)', () => {
    const setError = vi.fn();
    mergeServerErrors({ email: ['must be an email', 'extra'] }, undefined, setError);
    expect(setError).toHaveBeenCalledWith('email', 'must be an email');
  });

  it('returns empty result for undefined / non-object errors', () => {
    const setError = vi.fn();
    expect(mergeServerErrors(undefined, undefined, setError)).toEqual({
      applied: [],
      formError: undefined,
    });
    expect(setError).not.toHaveBeenCalled();
  });

  it('returns empty when the bag is absent from page errors', () => {
    const setError = vi.fn();
    const result = mergeServerErrors({ other: { x: 'y' } }, 'login', setError);
    expect(setError).not.toHaveBeenCalled();
    expect(result.applied).toEqual([]);
  });
});
