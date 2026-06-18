/**
 * Tests for the typed useForm wrapper.
 *
 * We mock @inertiajs/react's useForm so tests don't need a full Inertia context.
 * The wrapper is a thin type layer over the official hook: at runtime it must
 * forward every argument and return the underlying form object unchanged.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

const mockUseForm = vi.fn();

vi.mock('@inertiajs/react', () => ({
  useForm: (...args: unknown[]) => mockUseForm(...args),
}));

// Import AFTER mocking
const { useForm } = await import('../../src/react/index.js');

function fakeForm(data: Record<string, unknown>) {
  return {
    data,
    errors: {},
    processing: false,
    hasErrors: false,
    isDirty: false,
    setData: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    reset: vi.fn(),
    clearErrors: vi.fn(),
    setError: vi.fn(),
    transform: vi.fn(),
  };
}

describe('useForm (React typed wrapper)', () => {
  it('forwards initial data to the underlying useForm and returns its result', () => {
    mockUseForm.mockClear();
    const initial = { email: '', password: '' };
    mockUseForm.mockReturnValue(fakeForm(initial));

    const { result } = renderHook(() => useForm(initial));

    expect(mockUseForm).toHaveBeenCalledTimes(1);
    expect(mockUseForm).toHaveBeenCalledWith(initial);
    expect(result.current.data).toBe(initial);
  });

  it('forwards a remember key + data', () => {
    mockUseForm.mockClear();
    const initial = { name: '' };
    mockUseForm.mockReturnValue(fakeForm(initial));

    renderHook(() => useForm('create-user', initial));

    expect(mockUseForm).toHaveBeenCalledWith('create-user', initial);
  });

  it('forwards a data factory function', () => {
    mockUseForm.mockClear();
    const factory = () => ({ count: 0 });
    mockUseForm.mockReturnValue(fakeForm({ count: 0 }));

    renderHook(() => useForm(factory));

    expect(mockUseForm).toHaveBeenCalledWith(factory);
  });

  it('exposes errors/processing from the underlying form', () => {
    mockUseForm.mockClear();
    const form = fakeForm({ email: '' });
    form.errors = { email: 'Required' } as Record<string, unknown>;
    form.processing = true;
    mockUseForm.mockReturnValue(form);

    const { result } = renderHook(() => useForm({ email: '' }));

    expect(result.current.errors).toEqual({ email: 'Required' });
    expect(result.current.processing).toBe(true);
  });
});

// ---------- type-level assertions ----------
// Verified at runtime by vitest's expectTypeOf (which compiles these checks).
describe('useForm types', () => {
  it('keys data and errors by the form fields', () => {
    const form = useForm({ email: '', password: '' });

    expectTypeOf(form.data).toMatchTypeOf<{ email: string; password: string }>();
    expectTypeOf(form.processing).toBeBoolean();
    // errors is keyed by the form fields (string | undefined per field)
    expectTypeOf(form.errors).toHaveProperty('email');
    expectTypeOf(form.errors).toHaveProperty('password');
  });

  it('binds setData / setError / clearErrors to the form keys', () => {
    const form = useForm({ name: '', age: 0 });

    expectTypeOf(form.setData).parameter(0).toMatchTypeOf<'name' | 'age' | object>();
    expectTypeOf(form.setError).toBeFunction();
    expectTypeOf(form.clearErrors).toBeFunction();
  });
});
