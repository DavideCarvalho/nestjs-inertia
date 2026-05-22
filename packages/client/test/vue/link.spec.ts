/**
 * Tests for the typed Vue 3 <Link> component.
 *
 * We mock @inertiajs/vue3 so tests don't need a full Inertia context.
 */
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { setRouteResolver } from '../../src/routes-stub.js';

// Mock @inertiajs/vue3 Link: renders a plain <a> with all props forwarded
vi.mock('@inertiajs/vue3', () => ({
  Link: defineComponent({
    name: 'MockInertiaLink',
    props: {
      href: { type: String, required: true },
      class: { type: String, default: undefined },
      method: { type: String, default: undefined },
    },
    setup(props, { slots, attrs }) {
      return () =>
        h(
          'a',
          { href: props.href, class: props.class, 'data-testid': 'inertia-link', ...attrs },
          slots.default?.(),
        );
    },
  }),
}));

// Import AFTER mocking
// biome-ignore lint: dynamic import after mock
const { Link } = await import('../../src/vue/index.js');

function makeResolver(): (
  name: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
) => string {
  return (name, params, query) => {
    const routes: Record<string, string> = {
      'users.list': '/api/users',
      'users.show': '/api/users/:id',
    };
    let path = routes[name] ?? `/${name}`;
    if (params) {
      path = path.replace(/:([^/]+)/g, (_, key) => {
        const val = (params as Record<string, string>)[key];
        if (!val) throw new Error(`Missing param: ${key}`);
        return encodeURIComponent(val);
      });
    }
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const str = qs.toString();
      if (str) path += `?${str}`;
    }
    return path;
  };
}

describe('Vue Link component', () => {
  beforeEach(() => {
    setRouteResolver(makeResolver());
  });

  afterEach(() => {
    setRouteResolver(null);
  });

  it('renders an anchor with the computed href for a parameterless route', () => {
    const wrapper = mount(Link, {
      props: { route: 'users.list' },
      slots: { default: 'Users' },
    });
    const a = wrapper.find('[data-testid="inertia-link"]');
    expect(a.exists()).toBe(true);
    expect(a.attributes('href')).toBe('/api/users');
    expect(a.text()).toBe('Users');
  });

  it('passes through class attribute', () => {
    const wrapper = mount(Link, {
      props: { route: 'users.list', class: 'nav-link' },
      slots: { default: 'Users' },
    });
    const a = wrapper.find('[data-testid="inertia-link"]');
    expect(a.attributes('class')).toBe('nav-link');
  });

  it('appends query params to the href', () => {
    const wrapper = mount(Link, {
      props: { route: 'users.list', query: { active: 'true' } },
      slots: { default: 'Active Users' },
    });
    const a = wrapper.find('[data-testid="inertia-link"]');
    expect(a.attributes('href')).toBe('/api/users?active=true');
  });

  it('throws a clear error when setRouteResolver not called', () => {
    setRouteResolver(null);
    expect(() =>
      mount(Link, {
        props: { route: 'users.list' },
        slots: { default: 'Users' },
      }),
    ).toThrowError('@dudousxd/nestjs-inertia-client: setRouteResolver() not called');
  });
});

// ---------- type-level smoke tests ----------
describe('type smoke (runtime placeholder)', () => {
  it('compiles without error when routeParams is omitted for a parameterless route', () => {
    // This asserts the component mounts without a type error.
    // Typed checks happen in the example app after codegen augments InertiaRegistry.
    setRouteResolver(makeResolver());
    try {
      const wrapper = mount(Link, {
        props: { route: 'some.route' },
        slots: { default: 'text' },
      });
      expect(wrapper).toBeTruthy();
    } finally {
      setRouteResolver(null);
    }
  });
});
