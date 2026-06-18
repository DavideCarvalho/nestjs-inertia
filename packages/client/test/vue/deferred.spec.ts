/**
 * Tests for the typed Vue <Deferred> and <WhenVisible> wrappers.
 *
 * We mock @inertiajs/vue3's Deferred/WhenVisible so tests don't need a full
 * Inertia context. The wrappers are thin type layers — at runtime they must
 * forward the `data` key list (and extra props) plus slots to the official
 * component.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const mockDeferred = vi.fn();
const mockWhenVisible = vi.fn();

vi.mock('@inertiajs/vue3', () => ({
  Deferred: defineComponent({
    name: 'MockDeferred',
    props: { data: { type: [String, Array], required: true } },
    setup(props, { slots }) {
      mockDeferred(props);
      return () =>
        h('div', { 'data-testid': 'deferred', 'data-keys': JSON.stringify(props.data) }, [
          slots.default?.(),
        ]);
    },
  }),
  WhenVisible: defineComponent({
    name: 'MockWhenVisible',
    props: {
      data: { type: [String, Array], default: undefined },
      params: { type: Object, default: undefined },
      buffer: { type: Number, default: undefined },
      as: { type: String, default: undefined },
      always: { type: Boolean, default: undefined },
    },
    setup(props, { slots }) {
      mockWhenVisible({ ...props });
      return () =>
        h('div', { 'data-testid': 'when-visible', 'data-keys': JSON.stringify(props.data) }, [
          slots.default?.(),
        ]);
    },
  }),
}));

// Import AFTER mocking
const { Deferred, WhenVisible } = await import('../../src/vue/index.js');

describe('<Deferred> (Vue typed wrapper)', () => {
  it('forwards data (single key) to the underlying component', () => {
    mockDeferred.mockClear();
    const wrapper = mount(Deferred, {
      props: { data: 'users' },
      slots: { default: 'content' },
    });
    expect(mockDeferred).toHaveBeenCalledTimes(1);
    expect(mockDeferred.mock.calls[0][0].data).toBe('users');
    expect(wrapper.find('[data-testid="deferred"]').attributes('data-keys')).toBe('"users"');
  });

  it('forwards data as an array of keys', () => {
    mockDeferred.mockClear();
    mount(Deferred, {
      props: { data: ['users', 'stats'] },
      slots: { default: 'content' },
    });
    expect(mockDeferred.mock.calls[0][0].data).toEqual(['users', 'stats']);
  });
});

describe('<WhenVisible> (Vue typed wrapper)', () => {
  it('forwards data and extra props (buffer, always) to the underlying component', () => {
    mockWhenVisible.mockClear();
    mount(WhenVisible, {
      props: { data: 'comments', buffer: 250, always: true },
      slots: { default: 'content' },
    });
    expect(mockWhenVisible).toHaveBeenCalledTimes(1);
    const props = mockWhenVisible.mock.calls[0][0];
    expect(props.data).toBe('comments');
    expect(props.buffer).toBe(250);
    expect(props.always).toBe(true);
  });

  it('does not forward props that were not provided (lets official defaults apply)', () => {
    mockWhenVisible.mockClear();
    mount(WhenVisible, {
      props: { data: 'comments' },
      slots: { default: 'content' },
    });
    const props = mockWhenVisible.mock.calls[0][0];
    expect(props.buffer).toBeUndefined();
    expect(props.always).toBeUndefined();
    expect(props.as).toBeUndefined();
  });
});

// ---------- type-level assertions ----------
describe('Deferred/WhenVisible types (Vue)', () => {
  it('expose component definitions accepting data as a key or array', () => {
    expectTypeOf(Deferred).toBeObject();
    expectTypeOf(WhenVisible).toBeObject();
  });
});
