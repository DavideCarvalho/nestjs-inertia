export const VERSION = '1.8.0';

export { createFetcher } from './fetcher/fetcher.js';
export { setGlobalHeaders } from './fetcher/global-headers.js';
export { ApiHttpError } from './fetcher/errors.js';
export { buildUrl } from './fetcher/url-builder.js';
export { defineContract } from './contract/contract.js';
export { invalidate } from './invalidate.js';
export type { FetcherOptions, Fetcher } from './fetcher/fetcher.js';
export type { ContractDef } from './contract/contract.js';
// Server-only exports (NestJS decorators) → @dudousxd/nestjs-inertia-client/server
// SSR helpers → @dudousxd/nestjs-inertia-client/ssr
