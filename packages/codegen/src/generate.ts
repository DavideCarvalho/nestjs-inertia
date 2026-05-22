import { discoverPages } from './discovery/pages.js';
import { emitPages } from './emit/emit-pages.js';
import { emitCache } from './emit/emit-cache.js';
import { emitIndex } from './emit/emit-index.js';
import type { ResolvedConfig } from './config/types.js';

/**
 * Run one full codegen pass: discover pages, emit pages.d.ts, components.json, index.d.ts.
 * Route discovery is deliberately skipped — it requires spawning a Nest app and is
 * not appropriate for the hot path of a file watcher.
 */
export async function generate(config: ResolvedConfig): Promise<void> {
  const pages = await discoverPages({
    glob: config.pages.glob,
    cwd: config.codegen.cwd,
    propsExport: config.pages.propsExport,
    componentNameStrategy: config.pages.componentNameStrategy,
  });

  await emitPages(pages, config.codegen.outDir);
  await emitCache(pages, config.codegen.outDir);
  await emitIndex(config.codegen.outDir);
}
