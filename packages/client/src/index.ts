export const VERSION = '2.2.2';

export { createFetcher } from './fetcher/fetcher.js';
export { setGlobalHeaders } from './fetcher/global-headers.js';
export { ApiHttpError } from './fetcher/errors.js';
export { buildUrl } from './fetcher/url-builder.js';
export { defineContract } from './contract/contract.js';
export { invalidate } from './invalidate.js';
export type { FetcherOptions, Fetcher, SseOpts } from './fetcher/fetcher.js';
export type { ContractDef } from './contract/contract.js';
export type { Jsonify } from './shared/jsonify.js';
// Server-only exports (NestJS decorators) → @dudousxd/nestjs-inertia-client/server
// SSR helpers → @dudousxd/nestjs-inertia-client/ssr
