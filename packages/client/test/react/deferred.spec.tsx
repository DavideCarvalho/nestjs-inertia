/**
 * Tests for the typed <Deferred> and <WhenVisible> wrappers.
 *
 * We mock @inertiajs/react's Deferred/WhenVisible so tests don't need a full
 * Inertia context. The wrappers are thin type layers — at runtime they must
 * forward every prop (including the `data` key list) to the official component.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const mockDeferred = vi.fn();
const mockWhenVisible = vi.fn();

vi.mock('@inertiajs/react', () => ({
  Deferred: (props: Record<string, unknown>) => {
    mockDeferred(props);
    return (
      <div data-testid="deferred">
        {props.children as React.ReactNode}
        <span data-testid="deferred-data">{JSON.stringify(props.data)}</span>
      </div>
    );
  },
  WhenVisible: (props: Record<string, unknown>) => {
    mockWhenVisible(props);
    return (
      <div data-testid="when-visible">
        {props.children as React.ReactNode}
        <span data-testid="wv-data">{JSON.stringify(props.data)}</span>
      </div>
    );
  },
}));

// Import AFTER mocking
const { Deferred, WhenVisible } = await import('../../src/react/index.js');

describe('<Deferred> (typed wrapper)', () => {
  afterEach(cleanup);

  it('forwards data (single key) and fallback to the underlying component', () => {
    mockDeferred.mockClear();
    render(
      <Deferred data="users" fallback={<p>loading</p>}>
        <div>content</div>
      </Deferred>,
    );
    expect(mockDeferred).toHaveBeenCalledTimes(1);
    const props = mockDeferred.mock.calls[0][0];
    expect(props.data).toBe('users');
    expect(screen.getByTestId('deferred-data').textContent).toBe('"users"');
  });

  it('forwards data as an array of keys', () => {
    mockDeferred.mockClear();
    render(
      <Deferred data={['users', 'stats']} fallback={<p>loading</p>}>
        <div>content</div>
      </Deferred>,
    );
    const props = mockDeferred.mock.calls[0][0];
    expect(props.data).toEqual(['users', 'stats']);
  });
});

describe('<WhenVisible> (typed wrapper)', () => {
  afterEach(cleanup);

  it('forwards data and extra props (buffer, always) to the underlying component', () => {
    mockWhenVisible.mockClear();
    render(
      <WhenVisible data="comments" buffer={250} always fallback={<p>loading</p>}>
        <div>content</div>
      </WhenVisible>,
    );
    expect(mockWhenVisible).toHaveBeenCalledTimes(1);
    const props = mockWhenVisible.mock.calls[0][0];
    expect(props.data).toBe('comments');
    expect(props.buffer).toBe(250);
    expect(props.always).toBe(true);
  });
});

// ---------- type-level assertions ----------
describe('Deferred/WhenVisible types', () => {
  it('accepts data as a key, an array of keys, fallback, and slot children', () => {
    // Without codegen augmentation the page-prop keys fall back to `string`,
    // so these assert the generic shape compiles.
    expectTypeOf(Deferred).toBeFunction();
    expectTypeOf(WhenVisible).toBeFunction();

    const _a = (
      <Deferred data="users" fallback={null}>
        x
      </Deferred>
    );
    const _b = (
      <Deferred data={['a', 'b']} fallback={null}>
        x
      </Deferred>
    );
    const _c = (
      <WhenVisible data="x" fallback={null} buffer={10}>
        x
      </WhenVisible>
    );
    expect(_a).toBeTruthy();
    expect(_b).toBeTruthy();
    expect(_c).toBeTruthy();
  });
});
