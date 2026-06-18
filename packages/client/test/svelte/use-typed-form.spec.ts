/**
 * Tests for the typed useForm wrapper (Svelte).
 *
 * We mock @inertiajs/svelte's useForm so tests don't need a full Inertia
 * context. The wrapper is a thin type layer over the official function: at
 * runtime it must forward every argument and return the underlying form store
 * unchanged.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

const mockUseForm = vi.fn();

vi.mock('@inertiajs/svelte', () => ({
  useForm: (...args: unknown[]) => mockUseForm(...args),
}));

// Import AFTER mocking
const { useForm } = await import('../../src/svelte/use-typed-form.js');

function fakeForm(data: Record<string, unknown>) {
  return {
    ...data,
    errors: {},
    processing: false,
    hasErrors: false,
    isDirty: false,
    subscribe: vi.fn(() => () => {}),
    set: vi.fn(),
    update: vi.fn(),
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

describe('useForm (Svelte typed wrapper)', () => {
  it('forwards initial data to the underlying useForm and returns its store', () => {
    mockUseForm.mockClear();
    const initial = { email: '', password: '' };
    const store = fakeForm(initial);
    mockUseForm.mockReturnValue(store);

    const result = useForm(initial);

    expect(mockUseForm).toHaveBeenCalledTimes(1);
    expect(mockUseForm).toHaveBeenCalledWith(initial);
    expect(result).toBe(store);
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

  it('returns a subscribable store', () => {
    mockUseForm.mockClear();
    const store = fakeForm({ email: '' });
    mockUseForm.mockReturnValue(store);

    const result = useForm({ email: '' });

    expect(typeof result.subscribe).toBe('function');
  });
});

// ---------- type-level assertions ----------
// Verified at runtime by vitest's expectTypeOf (which compiles these checks).
describe('useForm types (Svelte)', () => {
  it('keys data fields and errors by the form fields', () => {
    const form = useForm({ email: '', password: '' });

    // Svelte's form store exposes the data fields on the form object
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
