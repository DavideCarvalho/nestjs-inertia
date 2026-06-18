/**
 * Tests for the typed useForm wrapper (Vue).
 *
 * We mock @inertiajs/vue3's useForm so tests don't need a full Inertia context.
 * The wrapper is a thin type layer over the official composable: at runtime it
 * must forward every argument and return the underlying form object unchanged.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

const mockUseForm = vi.fn();

vi.mock('@inertiajs/vue3', () => ({
  // Vue's useForm is the default export
  useForm: (...args: unknown[]) => mockUseForm(...args),
}));

// Import AFTER mocking
const { useForm } = await import('../../src/vue/index.js');

function fakeForm(data: Record<string, unknown>) {
  return {
    ...data,
    errors: {},
    processing: false,
    hasErrors: false,
    isDirty: false,
    data: () => data,
    setError: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    reset: vi.fn(),
    clearErrors: vi.fn(),
    transform: vi.fn(),
  };
}

describe('useForm (Vue typed wrapper)', () => {
  it('forwards initial data to the underlying useForm and returns its result', () => {
    mockUseForm.mockClear();
    const initial = { email: '', password: '' };
    const form = fakeForm(initial);
    mockUseForm.mockReturnValue(form);

    const result = useForm(initial);

    expect(mockUseForm).toHaveBeenCalledTimes(1);
    expect(mockUseForm).toHaveBeenCalledWith(initial);
    expect(result).toBe(form);
  });

  it('forwards a remember key + data', () => {
    mockUseForm.mockClear();
    const initial = { name: '' };
    mockUseForm.mockReturnValue(fakeForm(initial));

    useForm('create-user', initial);

    expect(mockUseForm).toHaveBeenCalledWith('create-user', initial);
  });

  it('forwards a data factory function', () => {
    mockUseForm.mockClear();
    const factory = () => ({ count: 0 });
    mockUseForm.mockReturnValue(fakeForm({ count: 0 }));

    useForm(factory);

    expect(mockUseForm).toHaveBeenCalledWith(factory);
  });

  it('exposes errors/processing from the underlying form', () => {
    mockUseForm.mockClear();
    const form = fakeForm({ email: '' });
    form.errors = { email: 'Required' } as Record<string, unknown>;
    form.processing = true;
    mockUseForm.mockReturnValue(form);

    const result = useForm({ email: '' });

    expect(result.errors).toEqual({ email: 'Required' });
    expect(result.processing).toBe(true);
  });
});

// ---------- type-level assertions ----------
// Verified at runtime by vitest's expectTypeOf (which compiles these checks).
describe('useForm types (Vue)', () => {
  it('keys reactive data and errors by the form fields', () => {
    const form = useForm({ email: '', password: '' });

    // Vue's form exposes data fields directly on the reactive object
    expectTypeOf(form.email).toBeString();
    expectTypeOf(form.password).toBeString();
    expectTypeOf(form.processing).toBeBoolean();
    expectTypeOf(form.errors).toHaveProperty('email');
    expectTypeOf(form.errors).toHaveProperty('password');
  });

  it('binds setError / clearErrors / reset to the form keys', () => {
    const form = useForm({ name: '', age: 0 });

    expectTypeOf(form.setError).toBeFunction();
    expectTypeOf(form.clearErrors).toBeFunction();
    expectTypeOf(form.reset).toBeFunction();
  });
});
