/**
 * Tests for the typed Svelte <Deferred> and <WhenVisible> wrappers.
 *
 * We mock @inertiajs/svelte's Deferred/WhenVisible with plain components so the
 * tests run without a full Inertia context. The wrappers are thin type layers —
 * at runtime they must forward the `data` key list (and extra props) plus the
 * snippets to the official component.
 */
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MockDeferred from './__mocks__/MockDeferred.svelte';
import MockWhenVisible from './__mocks__/MockWhenVisible.svelte';

vi.mock('@inertiajs/svelte', () => ({
  Deferred: MockDeferred,
  WhenVisible: MockWhenVisible,
}));

// Import the hosts AFTER mocking (they import the real wrappers, which import
// the mocked official components)
const { default: DeferredHost } = await import('./__mocks__/DeferredHost.svelte');
const { default: WhenVisibleHost } = await import('./__mocks__/WhenVisibleHost.svelte');

describe('<Deferred> (Svelte typed wrapper)', () => {
  afterEach(cleanup);

  it('forwards data (single key) and children to the underlying component', () => {
    const { getByTestId } = render(DeferredHost, { props: { data: 'users' } });
    expect(getByTestId('deferred').getAttribute('data-keys')).toBe('"users"');
    expect(getByTestId('content').textContent).toBe('content');
  });

  it('forwards data as an array of keys', () => {
    const { getByTestId } = render(DeferredHost, { props: { data: ['users', 'stats'] } });
    expect(getByTestId('deferred').getAttribute('data-keys')).toBe('["users","stats"]');
  });
});

describe('<WhenVisible> (Svelte typed wrapper)', () => {
  afterEach(cleanup);

  it('forwards data and extra props (buffer, always) to the underlying component', () => {
    const { getByTestId } = render(WhenVisibleHost, {
      props: { data: 'comments', buffer: 250, always: true },
    });
    const el = getByTestId('when-visible');
    expect(el.getAttribute('data-keys')).toBe('"comments"');
    expect(el.getAttribute('data-buffer')).toBe('250');
    expect(el.getAttribute('data-always')).toBe('true');
  });

  it('does not forward props that were not provided (lets official defaults apply)', () => {
    const { getByTestId } = render(WhenVisibleHost, { props: { data: 'comments' } });
    const el = getByTestId('when-visible');
    expect(el.getAttribute('data-buffer')).toBe('unset');
    expect(el.getAttribute('data-always')).toBe('unset');
  });
});
