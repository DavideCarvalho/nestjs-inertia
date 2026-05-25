/**
 * Tests for the useTypedReload hook (Vue).
 *
 * We mock @inertiajs/vue3 so tests don't need a full Inertia context.
 */
import { describe, expect, it, vi } from 'vitest';

const mockReload = vi.fn();

vi.mock('@inertiajs/vue3', () => ({
  router: {
    reload: mockReload,
  },
  Link: {},
}));

// Import AFTER mocking
const { useTypedReload } = await import('../../src/vue/index.js');

describe('useTypedReload (Vue)', () => {
  it('returns a function', () => {
    const reload = useTypedReload();
    expect(typeof reload).toBe('function');
  });

  it('calls router.reload with only option', () => {
    mockReload.mockClear();
    const reload = useTypedReload();
    reload({ only: ['users'] });
    expect(mockReload).toHaveBeenCalledWith({
      only: ['users'],
      except: undefined,
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });

  it('calls router.reload with except option', () => {
    mockReload.mockClear();
    const reload = useTypedReload();
    reload({ except: ['stats'] });
    expect(mockReload).toHaveBeenCalledWith({
      only: undefined,
      except: ['stats'],
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });

  it('calls router.reload with preserveScroll and preserveState', () => {
    mockReload.mockClear();
    const reload = useTypedReload();
    reload({ only: ['users'], preserveScroll: true, preserveState: true });
    expect(mockReload).toHaveBeenCalledWith({
      only: ['users'],
      except: undefined,
      preserveScroll: true,
      preserveState: true,
    });
  });

  it('calls router.reload with empty options when called without arguments', () => {
    mockReload.mockClear();
    const reload = useTypedReload();
    reload();
    expect(mockReload).toHaveBeenCalledWith({
      only: undefined,
      except: undefined,
      preserveScroll: undefined,
      preserveState: undefined,
    });
  });
});
