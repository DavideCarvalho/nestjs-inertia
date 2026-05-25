/**
 * Tests for Vue provider functions (provideInertiaRoutes / useInertiaRoutes).
 *
 * We use @vue/test-utils with a wrapper component to exercise the provide/inject flow.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import {
  INERTIA_ROUTES_KEY,
  provideInertiaRoutes,
  useInertiaRoutes,
} from '../../src/vue/provider.js';

// A child component that calls useInertiaRoutes and exposes the result
const ConsumerComponent = defineComponent({
  name: 'Consumer',
  setup() {
    const resolver = useInertiaRoutes();
    return () => h('span', { 'data-testid': 'resolved' }, resolver('test'));
  },
});

// A wrapper that calls provideInertiaRoutes in setup
function createProviderWrapper(resolverFn: (...args: unknown[]) => string) {
  return defineComponent({
    name: 'ProviderWrapper',
    setup(_, { slots }) {
      provideInertiaRoutes(resolverFn);
      return () => slots.default?.();
    },
  });
}

describe('Vue provideInertiaRoutes / useInertiaRoutes', () => {
  it('provides a resolver that useInertiaRoutes can retrieve', () => {
    const resolver = () => '/provided-route';
    const Wrapper = createProviderWrapper(resolver);
    const wrapper = mount(Wrapper, {
      slots: { default: () => h(ConsumerComponent) },
    });
    expect(wrapper.find('[data-testid="resolved"]').text()).toBe('/provided-route');
  });

  it('useInertiaRoutes throws when no provider is present', () => {
    expect(() => mount(ConsumerComponent)).toThrowError(
      '@dudousxd/nestjs-inertia-client: provideInertiaRoutes() not called',
    );
  });

  it('useInertiaRoutes returns the resolver when injected via INERTIA_ROUTES_KEY', () => {
    const resolver = (name: string) => `/api/${name}`;
    const wrapper = mount(ConsumerComponent, {
      global: {
        provide: { [INERTIA_ROUTES_KEY as unknown as symbol]: resolver },
      },
    });
    expect(wrapper.find('[data-testid="resolved"]').text()).toBe('/api/test');
  });
});
