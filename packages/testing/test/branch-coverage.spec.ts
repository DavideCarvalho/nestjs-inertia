import { describe, expect, it } from 'vitest';
import { assertInertia } from '../src/assert.js';
import { expectInertia } from '../src/expect.js';
import { createFakeInertiaRequest } from '../src/fakes/fake-request.js';
import { createFakeInertiaResponse } from '../src/fakes/fake-response.js';
import '../src/vitest.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildRes(
  body: unknown,
  status = 200,
  headers: Record<string, string | string[] | undefined> = {},
) {
  return {
    status,
    body,
    headers: { 'content-type': 'application/json', ...headers },
  };
}

function validPage(overrides: Record<string, unknown> = {}) {
  return { component: 'Page', props: {}, url: '/', version: 'v1', ...overrides };
}

// ===========================================================================
// 1. assert.ts — exercise assertInertia so the wrapper's branch is covered
// ===========================================================================
describe('assertInertia branch coverage', () => {
  it('wraps payload into InertiaAssertion and chains assertions', () => {
    const page = validPage({ props: { user: 'Ada' } });
    assertInertia(page).toRenderComponent('Page').toHaveProp('user', 'Ada');
  });

  it('throws when the payload is not a valid page object', () => {
    // assertInertia itself does not throw — it defers validation to assertion methods
    expect(() => assertInertia(null).toRenderComponent('X')).toThrow(/not a valid/);
    expect(() => assertInertia(undefined).toRenderComponent('X')).toThrow(/not a valid/);
    expect(() => assertInertia('string').toRenderComponent('X')).toThrow(/not a valid/);
    expect(() => assertInertia(42).toRenderComponent('X')).toThrow(/not a valid/);
  });
});

// ===========================================================================
// 2. testing-module.ts — default parameter branch (options = {})
// ===========================================================================
// The existing test always passes { version: 'tm-v1' }, so the default
// parameter branch is never taken. We import InertiaTestingModule directly
// and call forTest() with no args to cover it.
import { InertiaTestingModule } from '../src/testing-module.js';

describe('InertiaTestingModule branch coverage', () => {
  it('forTest() with no options uses defaults', () => {
    const mod = InertiaTestingModule.forTest();
    expect(mod).toBeDefined();
    expect(mod.module).toBeDefined();
  });
});

// ===========================================================================
// 3. fake-request.ts — uncovered branches on lines 11 and 32
// ===========================================================================
describe('createFakeInertiaRequest branch coverage', () => {
  // Line 32: opts.query !== undefined branch
  it('sets query when provided', () => {
    const req = createFakeInertiaRequest({ query: { page: 1, sort: 'asc' } });
    expect(req.query).toEqual({ page: 1, sort: 'asc' });
  });

  it('does not set query when not provided', () => {
    const req = createFakeInertiaRequest({});
    expect(req.query).toBeUndefined();
  });

  // Line 31: opts.body !== undefined branch
  it('sets body when provided', () => {
    const req = createFakeInertiaRequest({ body: { name: 'test' } });
    expect(req.body).toEqual({ name: 'test' });
  });

  it('does not set body when not provided', () => {
    const req = createFakeInertiaRequest({});
    expect(req.body).toBeUndefined();
  });

  // Line 11 (opts.originalUrl ?? opts.url ?? '/') — explicit originalUrl override
  it('uses originalUrl when provided separately from url', () => {
    const req = createFakeInertiaRequest({ url: '/foo', originalUrl: '/bar' });
    expect(req.url).toBe('/foo');
    expect(req.originalUrl).toBe('/bar');
  });

  it('falls back originalUrl to url when originalUrl not provided', () => {
    const req = createFakeInertiaRequest({ url: '/page' });
    expect(req.originalUrl).toBe('/page');
  });

  it('falls back to / when neither url nor originalUrl provided', () => {
    const req = createFakeInertiaRequest({});
    expect(req.originalUrl).toBe('/');
    expect(req.url).toBe('/');
  });

  // header() with missing key
  it('header() returns undefined for non-existent header', () => {
    const req = createFakeInertiaRequest({});
    expect(req.header('X-Missing')).toBeUndefined();
  });
});

// ===========================================================================
// 4. fake-response.ts — uncovered branches on lines 46-47 (getHeader)
// ===========================================================================
describe('createFakeInertiaResponse branch coverage', () => {
  it('getHeader returns the value for a set header', () => {
    const res = createFakeInertiaResponse();
    res.setHeader('X-Custom', 'val');
    expect(res.getHeader('X-Custom')).toBe('val');
  });

  it('getHeader returns undefined for an unset header', () => {
    const res = createFakeInertiaResponse();
    expect(res.getHeader('X-Missing')).toBeUndefined();
  });
});

// ===========================================================================
// 5. expect.ts — uncovered assertion branches
// ===========================================================================

// --- getNested edge cases ---
describe('getNested via toHaveProp — edge cases', () => {
  it('returns undefined for path through null', () => {
    const res = buildRes(validPage({ props: { a: null } }));
    expect(() => expectInertia(res).toHaveProp('a.b')).toThrow(/defined/);
  });

  it('returns undefined for path through primitive', () => {
    const res = buildRes(validPage({ props: { a: 42 } }));
    expect(() => expectInertia(res).toHaveProp('a.b')).toThrow(/defined/);
  });

  it('returns undefined for path through undefined intermediate', () => {
    const res = buildRes(validPage({ props: {} }));
    expect(() => expectInertia(res).toHaveProp('x.y.z')).toThrow(/defined/);
  });
});

// --- fail() context branches ---
describe('fail() context formatting', () => {
  it('includes Component name in error when component is present', () => {
    const res = buildRes(validPage({ component: 'Dashboard' }));
    expect(() => expectInertia(res).toRenderComponent('Home')).toThrow(/Dashboard/);
  });

  it('includes Available props in error when props object is present', () => {
    const res = buildRes(validPage({ props: { foo: 1, bar: 2 } }));
    expect(() => expectInertia(res).toRenderComponent('Other')).toThrow(/foo/);
  });

  it('shows (none) when props is empty', () => {
    const res = buildRes(validPage({ props: {} }));
    expect(() => expectInertia(res).toRenderComponent('Other')).toThrow(/\(none\)/);
  });
});

// --- page() validation ---
describe('page() validation', () => {
  it('throws when body is null', () => {
    const res = buildRes(null);
    expect(() => expectInertia(res).toRenderComponent('X')).toThrow(/not a valid/);
  });

  it('throws when body is not an object', () => {
    const res = buildRes('string body');
    expect(() => expectInertia(res).toRenderComponent('X')).toThrow(/not a valid/);
  });

  it('throws when body.component is not a string', () => {
    const res = buildRes({ component: 123, props: {}, url: '/', version: 'v' });
    expect(() => expectInertia(res).toRenderComponent('X')).toThrow(/not a valid/);
  });
});

// --- toHaveUrl failure branches ---
describe('toHaveUrl failure branches', () => {
  it('throws when string url does not match', () => {
    const res = buildRes(validPage({ url: '/actual' }));
    expect(() => expectInertia(res).toHaveUrl('/expected')).toThrow(/expected.*actual/i);
  });

  it('throws when regex url does not match', () => {
    const res = buildRes(validPage({ url: '/actual' }));
    expect(() => expectInertia(res).toHaveUrl(/^\/nope/)).toThrow(/actual/);
  });
});

// --- toHaveVersion failure branches ---
describe('toHaveVersion failure branches', () => {
  it('throws when string version does not match', () => {
    const res = buildRes(validPage({ version: 'v2' }));
    expect(() => expectInertia(res).toHaveVersion('v1')).toThrow(/v1.*v2|v2.*v1/);
  });

  it('throws when regex version does not match', () => {
    const res = buildRes(validPage({ version: 'v2' }));
    expect(() => expectInertia(res).toHaveVersion(/^v3/)).toThrow(/v2/);
  });
});

// --- toHaveProp failure: path missing entirely ---
describe('toHaveProp failure — missing prop', () => {
  it('throws when prop path is not defined', () => {
    const res = buildRes(validPage({ props: { a: 1 } }));
    expect(() => expectInertia(res).toHaveProp('missing')).toThrow(/defined/);
  });
});

// --- toHavePropMatching failure branches ---
describe('toHavePropMatching failure branches', () => {
  it('throws when prop is not a string', () => {
    const res = buildRes(validPage({ props: { n: 42 } }));
    expect(() => expectInertia(res).toHavePropMatching('n', /\d+/)).toThrow(/match/);
  });

  it('throws when string prop does not match regex', () => {
    const res = buildRes(validPage({ props: { s: 'hello' } }));
    expect(() => expectInertia(res).toHavePropMatching('s', /^world/)).toThrow(/match/);
  });
});

// --- toMissProp failure ---
describe('toMissProp failure', () => {
  it('throws when prop is present', () => {
    const res = buildRes(validPage({ props: { a: 1 } }));
    expect(() => expectInertia(res).toMissProp('a')).toThrow(/missing/);
  });
});

// --- toHaveExactProps ---
describe('toHaveExactProps', () => {
  it('passes when props match exactly', () => {
    const res = buildRes(validPage({ props: { a: 1, b: 'two' } }));
    expectInertia(res).toHaveExactProps({ a: 1, b: 'two' });
  });

  it('throws when props do not match', () => {
    const res = buildRes(validPage({ props: { a: 1 } }));
    expect(() => expectInertia(res).toHaveExactProps({ a: 2 })).toThrow(/exact props/i);
  });
});

// --- toShareProp (alias for toHaveProp) ---
describe('toShareProp', () => {
  it('delegates to toHaveProp', () => {
    const res = buildRes(validPage({ props: { shared: 'yes' } }));
    expectInertia(res).toShareProp('shared', 'yes');
  });
});

// --- toHaveDeferredProp failure branches ---
describe('toHaveDeferredProp failure branches', () => {
  it('throws when deferredProps is empty', () => {
    const res = buildRes(validPage());
    expect(() => expectInertia(res).toHaveDeferredProp('stats')).toThrow(/deferred/);
  });

  it('throws when prop not in specified group', () => {
    const res = buildRes(validPage({ deferredProps: { default: ['other'] } }));
    expect(() => expectInertia(res).toHaveDeferredProp('stats', 'default')).toThrow(/deferred/);
  });

  it('throws when specified group does not exist', () => {
    const res = buildRes(validPage({ deferredProps: { default: ['stats'] } }));
    expect(() => expectInertia(res).toHaveDeferredProp('stats', 'missing')).toThrow(/deferred/);
  });
});

// --- toHaveMergeProp branches ---
describe('toHaveMergeProp branch coverage', () => {
  it('checks deepMergeProps list', () => {
    const res = buildRes(validPage({ props: { items: [] }, deepMergeProps: ['items'] }));
    expectInertia(res).toHaveMergeProp('items');
  });

  it('throws when prop not in merge or deepMerge', () => {
    const res = buildRes(validPage({ props: { items: [] } }));
    expect(() => expectInertia(res).toHaveMergeProp('items')).toThrow(/merge/i);
  });

  it('checks matchOn option', () => {
    const res = buildRes(
      validPage({
        props: { items: [] },
        mergeProps: ['items'],
        matchPropsOn: { items: 'id' },
      }),
    );
    expectInertia(res).toHaveMergeProp('items', { matchOn: 'id' });
  });

  it('throws when matchOn does not match', () => {
    const res = buildRes(
      validPage({
        props: { items: [] },
        mergeProps: ['items'],
        matchPropsOn: { items: 'id' },
      }),
    );
    expect(() => expectInertia(res).toHaveMergeProp('items', { matchOn: 'name' })).toThrow(
      /matchOn/,
    );
  });

  it('throws when matchOn is expected but not defined on page', () => {
    const res = buildRes(validPage({ props: { items: [] }, mergeProps: ['items'] }));
    expect(() => expectInertia(res).toHaveMergeProp('items', { matchOn: 'id' })).toThrow(/matchOn/);
  });
});

// --- toHaveAlwaysProp / toHaveOptionalProp ---
describe('toHaveAlwaysProp and toHaveOptionalProp', () => {
  it('toHaveAlwaysProp passes when prop exists', () => {
    const res = buildRes(validPage({ props: { alw: 'yes' } }));
    expectInertia(res).toHaveAlwaysProp('alw');
  });

  it('toHaveOptionalProp passes when prop exists', () => {
    const res = buildRes(validPage({ props: { opt: 'val' } }));
    expectInertia(res).toHaveOptionalProp('opt');
  });
});

// --- toRedirectExternal failure branches ---
describe('toRedirectExternal failure branches', () => {
  it('throws when status is not 409', () => {
    const res = buildRes(null, 302, { 'x-inertia-location': 'https://x.com' });
    expect(() => expectInertia(res).toRedirectExternal('https://x.com')).toThrow(/409/);
  });

  it('throws when X-Inertia-Location does not match', () => {
    const res = { status: 409, body: null, headers: { 'x-inertia-location': 'https://a.com' } };
    expect(() => expectInertia(res).toRedirectExternal('https://b.com')).toThrow(
      /X-Inertia-Location/,
    );
  });
});

// --- toRedirectTo branches ---
describe('toRedirectTo branch coverage', () => {
  it('checks Location without status constraint', () => {
    const res = { status: 302, body: null, headers: { location: '/home' } };
    expectInertia(res).toRedirectTo('/home');
  });

  it('throws when status does not match provided status', () => {
    const res = { status: 302, body: null, headers: { location: '/home' } };
    expect(() => expectInertia(res).toRedirectTo('/home', 303)).toThrow(/303/);
  });

  it('throws when Location does not match', () => {
    const res = { status: 302, body: null, headers: { location: '/other' } };
    expect(() => expectInertia(res).toRedirectTo('/expected')).toThrow(/Location/);
  });
});

// --- toHaveErrors branches ---
describe('toHaveErrors branch coverage', () => {
  it('throws when string error does not match', () => {
    const res = buildRes(validPage({ props: { errors: { email: 'required' } } }));
    expect(() => expectInertia(res).toHaveErrors({ email: 'invalid' })).toThrow(/email/);
  });

  it('throws when regex error does not match', () => {
    const res = buildRes(validPage({ props: { errors: { email: 'required' } } }));
    expect(() => expectInertia(res).toHaveErrors({ email: /^invalid/ })).toThrow(/email/);
  });

  it('throws when regex error is tested against non-string value', () => {
    const res = buildRes(validPage({ props: { errors: { count: 42 } } }));
    expect(() => expectInertia(res).toHaveErrors({ count: /\d+/ })).toThrow(/count/);
  });

  it('handles missing errors gracefully (defaults to empty object)', () => {
    const res = buildRes(validPage({ props: {} }));
    expect(() => expectInertia(res).toHaveErrors({ email: 'required' })).toThrow(/email/);
  });
});

// --- toHaveErrorBag branches ---
describe('toHaveErrorBag branch coverage', () => {
  it('throws when bag is not an object', () => {
    const res = buildRes(validPage({ props: { errors: { signin: 'not-obj' } } }));
    expect(() => expectInertia(res).toHaveErrorBag('signin')).toThrow(/object/);
  });

  it('throws when bag is null', () => {
    const res = buildRes(validPage({ props: { errors: { signin: null } } }));
    expect(() => expectInertia(res).toHaveErrorBag('signin')).toThrow(/object/);
  });

  it('throws when bag does not exist', () => {
    const res = buildRes(validPage({ props: { errors: {} } }));
    expect(() => expectInertia(res).toHaveErrorBag('missing')).toThrow(/object/);
  });
});

// --- toRenderFullHtml branches ---
describe('toRenderFullHtml branch coverage', () => {
  it('throws when content-type is not html', () => {
    const res = { status: 200, body: '', headers: { 'content-type': 'application/json' } };
    expect(() => expectInertia(res).toRenderFullHtml()).toThrow(/HTML/);
  });

  it('throws when content-type is undefined', () => {
    const res = { status: 200, body: '', headers: {} as Record<string, string> };
    expect(() => expectInertia(res).toRenderFullHtml()).toThrow(/HTML/);
  });

  it('handles array content-type header', () => {
    const res = {
      status: 200,
      body: '<html></html>',
      headers: { 'content-type': ['text/html', 'charset=utf-8'] as unknown as string },
    };
    expectInertia(res).toRenderFullHtml();
  });
});

// --- withSsrHead branches ---
describe('withSsrHead branch coverage', () => {
  it('falls back to body when text is not present and body is string', () => {
    const res = {
      status: 200,
      body: '<html><head><title>Test</title></head></html>',
      headers: { 'content-type': 'text/html' },
    };
    expectInertia(res).withSsrHead(/<title>Test/);
  });

  it('uses empty string when neither text nor string body', () => {
    const res = {
      status: 200,
      body: { component: 'X', props: {}, url: '/', version: 'v' },
      headers: { 'content-type': 'text/html' },
    };
    expect(() => expectInertia(res).withSsrHead(/something/)).toThrow(/SSR head/);
  });

  it('throws when pattern does not match', () => {
    const res = {
      status: 200,
      body: '',
      headers: { 'content-type': 'text/html' },
      text: '<html><head></head></html>',
    };
    expect(() => expectInertia(res).withSsrHead(/<title>/)).toThrow(/SSR head/);
  });
});

// --- pageObject / unwrap ---
describe('pageObject and unwrap', () => {
  it('pageObject returns the parsed page', () => {
    const res = buildRes(validPage({ component: 'Home' }));
    const page = expectInertia(res).pageObject();
    expect(page.component).toBe('Home');
  });

  it('unwrap returns a plain object with core fields', () => {
    const res = buildRes(
      validPage({ component: 'Home', props: { a: 1 }, url: '/x', version: 'v2' }),
    );
    const u = expectInertia(res).unwrap();
    expect(u).toEqual({ component: 'Home', props: { a: 1 }, url: '/x', version: 'v2' });
  });
});

// ===========================================================================
// 6. vitest.ts matchers — exercise remaining uncovered matchers
// ===========================================================================
describe('Vitest matchers — additional coverage', () => {
  it('toHaveInertiaUrl matcher works with string', () => {
    const res = {
      status: 200,
      body: validPage({ url: '/dashboard' }),
      headers: {},
    };
    expect(res).toHaveInertiaUrl('/dashboard');
  });

  it('toHaveInertiaUrl matcher works with regex', () => {
    const res = {
      status: 200,
      body: validPage({ url: '/dashboard?tab=1' }),
      headers: {},
    };
    expect(res).toHaveInertiaUrl(/dashboard/);
  });

  it('toHaveInertiaVersion matcher works with string', () => {
    const res = {
      status: 200,
      body: validPage({ version: 'abc123' }),
      headers: {},
    };
    expect(res).toHaveInertiaVersion('abc123');
  });

  it('toHaveInertiaVersion matcher works with regex', () => {
    const res = {
      status: 200,
      body: validPage({ version: 'abc123' }),
      headers: {},
    };
    expect(res).toHaveInertiaVersion(/^abc/);
  });

  it('toMissInertiaProp matcher works', () => {
    const res = {
      status: 200,
      body: validPage({ props: { a: 1 } }),
      headers: {},
    };
    expect(res).toMissInertiaProp('b');
  });

  it('toRedirectInertiaExternal matcher works', () => {
    const res = {
      status: 409,
      body: null,
      headers: { 'x-inertia-location': 'https://stripe.com' },
    };
    expect(res).toRedirectInertiaExternal('https://stripe.com');
  });

  // Test the failure path of runAssertion (pass: false)
  it('toHaveInertiaUrl produces failure message on mismatch', () => {
    const res = {
      status: 200,
      body: validPage({ url: '/actual' }),
      headers: {},
    };
    expect(() => expect(res).toHaveInertiaUrl('/wrong')).toThrow();
  });

  it('toMissInertiaProp produces failure message when prop exists', () => {
    const res = {
      status: 200,
      body: validPage({ props: { a: 1 } }),
      headers: {},
    };
    expect(() => expect(res).toMissInertiaProp('a')).toThrow();
  });

  // Cover the text spread branch in runAssertion
  it('matcher handles response with text field', () => {
    const res = {
      status: 200,
      body: validPage(),
      headers: {},
      text: '<html></html>',
    };
    expect(res).toRenderInertiaComponent('Page');
  });

  // Cover the defaults (status ?? 200, headers ?? {})
  it('matcher handles response with missing status and headers', () => {
    const res = {
      body: validPage(),
    };
    expect(res).toRenderInertiaComponent('Page');
  });
});
