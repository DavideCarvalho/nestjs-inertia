export const VERSION = '2.0.0';

export { createFetcher } from './fetcher/fetcher.js';
export { ApiHttpError } from './fetcher/errors.js';
export { buildUrl } from './fetcher/url-builder.js';
export { defineContract } from './contract/contract.js';
export { ApplyContract } from './contract/apply-contract.decorator.js';
export { As, ROUTE_NAME_METADATA } from './contract/as.decorator.js';
export { ContractValidationPipe } from './contract/contract-validation.pipe.js';
export { CONTRACT_METADATA, getContract } from './contract/metadata.js';
export type { ApplyContractOptions } from './contract/apply-contract.decorator.js';
export { invalidate } from './invalidate.js';
export type { FetcherOptions, Fetcher } from './fetcher/fetcher.js';
export type { ContractDef } from './contract/contract.js';
// SSR helpers are available via the `./ssr` subpath export (dist/ssr/hydrate.js)
