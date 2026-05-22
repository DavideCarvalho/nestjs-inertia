import { expect } from 'vitest';
import { InertiaAssertion } from './expect.js';

function runAssertion(received: unknown, name: string, args: unknown[]): { pass: boolean; message: () => string } {
  const res = received as { status?: number; body?: unknown; headers?: Record<string, string>; text?: string };
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

expect.extend({
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
});

declare module 'vitest' {
  interface Assertion {
    toRenderInertiaComponent(name: string): void;
    toHaveInertiaProp(path: string, value?: unknown): void;
    toHaveInertiaUrl(url: string | RegExp): void;
    toHaveInertiaVersion(matcher: string | RegExp): void;
    toMissInertiaProp(path: string): void;
    toRedirectInertiaExternal(url: string): void;
  }
}
