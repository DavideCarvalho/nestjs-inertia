import { InertiaAssertion } from './expect.js';

export function assertInertia(payload: unknown): InertiaAssertion {
  // Adapt a plain payload to the ResponseLike interface
  return new InertiaAssertion({
    status: 200,
    body: payload,
    headers: { 'content-type': 'application/json' },
  });
}
