import { discoverPages } from './discovery/pages.js';
import { emitPages } from './emit/emit-pages.js';
import { emitCache } from './emit/emit-cache.js';
import { emitIndex } from './emit/emit-index.js';
import { emitApi } from './emit/emit-api.js';
import { emitRoutes } from './emit/emit-routes.js';
import type { ResolvedConfig } from './config/types.js';
import type { RouteDescriptor } from './discovery/routes.js';

/**
 * Run one full codegen pass: discover pages, emit pages.d.ts, components.json, index.d.ts.
 * Route discovery is deliberately skipped — it requires spawning a Nest app and is
 * not appropriate for the hot path of a file watcher.
 *
 * Optionally accepts pre-discovered routes (e.g. from a full generate + route-discovery pass).
 * When routes are present, emits routes.ts.
 * When routes with contracts are present, also emits api.ts.
 */
export async function generate(config: ResolvedConfig, routes: RouteDescriptor[] = []): Promise<void> {
  const pages = await discoverPages({
    glob: config.pages.glob,
    cwd: config.codegen.cwd,
    propsExport: config.pages.propsExport,
    componentNameStrategy: config.pages.componentNameStrategy,
  });

  await emitPages(pages, config.codegen.outDir);
  await emitCache(pages, config.codegen.outDir);

  const hasRoutes = routes.length > 0;
  const hasContracts = routes.some((r) => r.contract);

  if (hasRoutes) {
    await emitRoutes(routes, config.codegen.outDir);
  }

  await emitIndex(config.codegen.outDir, hasContracts);

  if (hasContracts) {
    await emitApi(routes, config.codegen.outDir);
  }
}
