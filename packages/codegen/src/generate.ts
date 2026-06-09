import { join } from 'node:path';
import { Project } from 'ts-morph';
import type { ResolvedConfig } from './config/types.js';
import { discoverPages } from './discovery/pages.js';
import type { SharedPropsResult } from './discovery/shared-props.js';
import { discoverSharedProps } from './discovery/shared-props.js';
import type { RouteDescriptor } from './discovery/types.js';
import { emitApi } from './emit/emit-api.js';
import { emitCache } from './emit/emit-cache.js';
import { emitForms } from './emit/emit-forms.js';
import { emitIndex } from './emit/emit-index.js';
import { emitPages } from './emit/emit-pages.js';
import { emitRoutes } from './emit/emit-routes.js';

/**
 * Run one full codegen pass: discover pages, emit pages.d.ts, components.json, index.d.ts.
 * Route discovery is deliberately skipped — it requires spawning a Nest app and is
 * not appropriate for the hot path of a file watcher.
 *
 * Optionally accepts pre-discovered routes (e.g. from a full generate + route-discovery pass).
 * When routes are present, emits routes.ts.
 * When routes with contracts are present, also emits api.ts.
 */
export async function generate(
  config: ResolvedConfig,
  routes: RouteDescriptor[] = [],
): Promise<void> {
  const pages = await discoverPages({
    glob: config.pages.glob,
    cwd: config.codegen.cwd,
    propsExport: config.pages.propsExport,
    componentNameStrategy: config.pages.componentNameStrategy,
  });

  // Discover shared props from InertiaModule.forRoot({ share: ... }) if moduleEntry is configured
  let sharedProps: SharedPropsResult | null = null;
  if (config.app?.moduleEntry) {
    try {
      const tsconfigPath = config.app.tsconfig ?? join(config.codegen.cwd, 'tsconfig.json');
      let project: Project;
      try {
        project = new Project({
          tsConfigFilePath: tsconfigPath,
          skipAddingFilesFromTsConfig: true,
          skipLoadingLibFiles: true,
          skipFileDependencyResolution: true,
        });
      } catch {
        project = new Project({
          skipAddingFilesFromTsConfig: true,
          skipLoadingLibFiles: true,
          skipFileDependencyResolution: true,
          compilerOptions: { allowJs: true, strict: false },
        });
      }
      sharedProps = discoverSharedProps(project, config.app.moduleEntry);
    } catch {
      // Graceful fallback — skip shared props if anything goes wrong
    }
  }

  await emitPages(pages, config.codegen.outDir, {
    propsExport: config.pages.propsExport,
    sharedProps,
  });
  await emitCache(pages, config.codegen.outDir);

  const hasRoutes = routes.length > 0;
  const hasContracts = routes.some((r) => r.contract);

  if (hasRoutes) {
    await emitRoutes(routes, config.codegen.outDir);
  }

  if (hasContracts) {
    await emitApi(routes, config.codegen.outDir, config.fetcher?.importPath);
  }

  const hasForms = await emitForms(routes, config.codegen.outDir, config.forms);

  await emitIndex(config.codegen.outDir, hasContracts, hasForms);
}
