// Note: this file is imported by Jest users.
// We use globalThis.expect.extend instead of importing from 'jest'
// because the testing package's own tests use vitest, not jest.
import { InertiaAssertion } from './expect.js';

function runAssertion(
  received: unknown,
  name: string,
  args: unknown[],
): { pass: boolean; message: () => string } {
  const res = received as {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
    text?: string;
  };
  const assertion = new InertiaAssertion({
    status: res.status ?? 200,
    body: res.body,
    headers: res.headers ?? {},
    ...(res.text !== undefined ? { text: res.text } : {}),
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (assertion as unknown as Record<string, (...a: unknown[]) => InertiaAssertion>)[name]!(...args);
    return { pass: true, message: () => `Expected NOT ${name}(${args.join(', ')})` };
  } catch (err) {
    return { pass: false, message: () => (err as Error).message };
  }
}

const matchers = {
  toRenderInertiaComponent(received: unknown, name: string) {
    return runAssertion(received, 'toRenderComponent', [name]);
  },
  toHaveInertiaProp(received: unknown, path: string, value?: unknown) {
    return runAssertion(received, 'toHaveProp', [path, value]);
  },
  toHaveInertiaUrl(received: unknown, url: string | RegExp) {
    return runAssertion(received, 'toHaveUrl', [url]);
  },
  toHaveInertiaVersion(received: unknown, matcher: string | RegExp) {
    return runAssertion(received, 'toHaveVersion', [matcher]);
  },
  toMissInertiaProp(received: unknown, path: string) {
    return runAssertion(received, 'toMissProp', [path]);
  },
  toRedirectInertiaExternal(received: unknown, url: string) {
    return runAssertion(received, 'toRedirectExternal', [url]);
  },
};

// Use the global `expect.extend` — works for both Jest and Vitest at runtime.
// In Jest, declare module 'expect' augmentation; in Vitest, see vitest.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalExpect = (globalThis as { expect?: { extend: (m: Record<string, unknown>) => void } })
  .expect;
if (globalExpect?.extend) {
  globalExpect.extend(matchers);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toRenderInertiaComponent(name: string): R;
      toHaveInertiaProp(path: string, value?: unknown): R;
      toHaveInertiaUrl(url: string | RegExp): R;
      toHaveInertiaVersion(matcher: string | RegExp): R;
      toMissInertiaProp(path: string): R;
      toRedirectInertiaExternal(url: string): R;
    }
  }
}
