/**
 * Tests for useInertiaForm. We mock @inertiajs/react so tests don't need a full
 * Inertia runtime: `router[method]` is a spy, and `usePage` returns a mutable
 * page-errors object we can change between renders.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const routerMock = {
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

let pageErrors: Record<string, unknown> = {};

vi.mock('@inertiajs/react', () => ({
  router: routerMock,
  usePage: () => ({ props: { errors: pageErrors } }),
}));

const { useInertiaForm } = await import('../../src/react-form/use-inertia-form.js');

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type Values = z.infer<typeof schema>;

beforeEach(() => {
  routerMock.post.mockReset();
  routerMock.put.mockReset();
  routerMock.patch.mockReset();
  routerMock.delete.mockReset();
  pageErrors = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

function setup(options?: Partial<Parameters<typeof useInertiaForm<Values>>[0]>) {
  return renderHook(() =>
    useInertiaForm<Values>({
      schema,
      action: { method: 'post', url: '/auth/login' },
      defaultValues: { email: '', password: '' },
      ...options,
    }),
  );
}

describe('useInertiaForm', () => {
  it('does NOT call router and populates errors when client validation fails', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setValue('email', 'not-an-email');
      result.current.setValue('password', 'short');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(routerMock.post).not.toHaveBeenCalled();
    expect(result.current.formState.errors.email).toBeDefined();
    expect(result.current.formState.errors.password).toBeDefined();
  });

  it('calls router[method] with values when client validation passes', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.setValue('email', 'a@b.com');
      result.current.setValue('password', 'longenough');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(routerMock.post).toHaveBeenCalledTimes(1);
    const [url, values] = routerMock.post.mock.calls[0];
    expect(url).toBe('/auth/login');
    expect(values).toEqual({ email: 'a@b.com', password: 'longenough' });
  });

  it('sends X-Inertia-Error-Bag header when errorBag is set', async () => {
    const { result } = setup({ errorBag: 'login' });
    await act(async () => {
      result.current.setValue('email', 'a@b.com');
      result.current.setValue('password', 'longenough');
    });
    await act(async () => {
      await result.current.submit();
    });
    const visit = routerMock.post.mock.calls[0][2];
    expect(visit.headers['X-Inertia-Error-Bag']).toBe('login');
  });

  it('merges server errors from usePage into RHF state (scoped by bag)', async () => {
    const { result, rerender } = setup({ errorBag: 'login' });
    act(() => {
      pageErrors = { login: { email: 'Already taken' } };
    });
    rerender();
    await waitFor(() => {
      expect(result.current.formState.errors.email?.message).toBe('Already taken');
    });
  });

  it('aggregates unknown server keys into formError', async () => {
    const { result, rerender } = setup();
    act(() => {
      pageErrors = { _: 'Server is down' };
    });
    rerender();
    await waitFor(() => {
      expect(result.current.formError).toBe('Server is down');
    });
  });

  it('resets to defaultValues on success when resetOnSuccess is set', async () => {
    routerMock.post.mockImplementation((_url, _values, opts) => {
      opts.onSuccess?.();
    });
    const { result } = setup({ resetOnSuccess: true });
    await act(async () => {
      result.current.setValue('email', 'a@b.com');
      result.current.setValue('password', 'longenough');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.getValues()).toEqual({ email: '', password: '' });
  });

  it('toggles isSubmitting around onStart/onFinish', async () => {
    let captured: { onStart?: () => void; onFinish?: () => void } = {};
    routerMock.post.mockImplementation((_url, _values, opts) => {
      captured = opts;
      opts.onStart?.();
    });
    const { result } = setup();
    await act(async () => {
      result.current.setValue('email', 'a@b.com');
      result.current.setValue('password', 'longenough');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      captured.onFinish?.();
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does not loop: a stable page-errors identity applies setError once', async () => {
    const { result, rerender } = setup();
    const stable = { email: 'bad' };
    act(() => {
      pageErrors = stable;
    });
    rerender();
    await waitFor(() => {
      expect(result.current.formState.errors.email?.message).toBe('bad');
    });
    const setErrorSpy = vi.spyOn(result.current, 'setError');
    // Re-render without changing the errors identity → no re-apply.
    rerender();
    rerender();
    expect(setErrorSpy).not.toHaveBeenCalled();
  });
});
