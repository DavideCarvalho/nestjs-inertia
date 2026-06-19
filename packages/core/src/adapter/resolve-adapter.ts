import type { HttpAdapterHost } from '@nestjs/core';
import type { RequestAdapter } from './adapter.js';
import { expressAdapter } from './express.js';
import { fastifyAdapter } from './fastify.js';

/**
 * Pick the request/response adapter for the running HTTP platform. Fastify
 * reports `getType() === 'fastify'`; everything else (Express, or an unknown
 * adapter) uses the Express adapter, which is the framework default.
 */
export function resolvePlatformAdapter(host: HttpAdapterHost): RequestAdapter {
  return host.httpAdapter?.getType() === 'fastify' ? fastifyAdapter : expressAdapter;
}
