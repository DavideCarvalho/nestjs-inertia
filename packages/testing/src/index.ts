export const VERSION = '0.9.0-alpha.0';

export { expectInertia, InertiaAssertion } from './expect.js';
export type { PageObject } from './expect.js';
export { assertInertia } from './assert.js';
export { createFakeInertiaRequest } from './fakes/fake-request.js';
export type { FakeInertiaRequest } from './fakes/fake-request.js';
export { createFakeInertiaResponse } from './fakes/fake-response.js';
export type { FakeInertiaResponse } from './fakes/fake-response.js';
export { InertiaTestingModule } from './testing-module.js';
