/**
 * Tests for the useTypedReload hook.
 *
 * We mock @inertiajs/react so tests don't need a full Inertia context.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockReload = vi.fn();

vi.mock('@inertiajs/react', () => ({
  router: {
    reload: mockReload,
  },
}));

// Import AFTER mocking
const { useTypedReload } = await import('../../src/react/index.js');

describe('useTypedReload (React)', () => {
  it('returns a function', () => {
    const { result } = renderHook(() => useTypedReload());
    expect(typeof result.current).toBe('function');
  });

  it('calls router.reload with only option', () => {
    mockReload.mockClear();
    const { result } = renderHook(() => useTypedReload());
    result.current({ only: ['users'] });
    expect(mockReload).toHaveBeenCalledWith({
      only: ['users'],
      except: undefined,
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });

  it('calls router.reload with except option', () => {
    mockReload.mockClear();
    const { result } = renderHook(() => useTypedReload());
    result.current({ except: ['stats'] });
    expect(mockReload).toHaveBeenCalledWith({
      only: undefined,
      except: ['stats'],
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });

  it('calls router.reload with preserveScroll and preserveState', () => {
    mockReload.mockClear();
    const { result } = renderHook(() => useTypedReload());
    result.current({ only: ['users'], preserveScroll: true, preserveState: true });
    expect(mockReload).toHaveBeenCalledWith({
      only: ['users'],
      except: undefined,
      preserveScroll: true,
      preserveState: true,
    });
  });

  it('calls router.reload with empty options when called without arguments', () => {
    mockReload.mockClear();
    const { result } = renderHook(() => useTypedReload());
    result.current();
    expect(mockReload).toHaveBeenCalledWith({
      only: undefined,
      except: undefined,
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });
});
