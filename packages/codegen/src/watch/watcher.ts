import { join } from 'node:path';
import chokidar from 'chokidar';
import type { ResolvedConfig } from '../config/types.js';
import { discoverContractsFast } from '../discovery/contracts-fast.js';
import type { RouteDescriptor } from '../discovery/routes.js';
import { discoverRoutes as defaultDiscoverRoutes } from '../discovery/routes.js';
import { emitApi } from '../emit/emit-api.js';
import { emitIndex } from '../emit/emit-index.js';
import { emitRoutes } from '../emit/emit-routes.js';
import { generate } from '../generate.js';
import { acquireLock } from './lock-file.js';

const PAGES_DEBOUNCE_MS = 150;

export interface Watcher {
  close(): Promise<void>;
}

/** No-op watcher returned when the lock is already held. */
const NO_OP_WATCHER: Watcher = { close: async () => {} };

/**
 * Start two chokidar watchers:
 *
 * 1. **Pages watcher** (`config.pages.glob`, 150 ms debounce) — runs `generate(config)` on
 *    any page file change, regenerating `pages.d.ts` and the cache manifest.
 *
 * 2. **Contracts watcher** (`config.contracts.glob`, configurable debounce — default 500 ms) —
 *    re-runs route discovery, then re-emits `routes.ts` and (when contracts are present)
 *    `api.ts` + `index.d.ts`.
 *
 * Both watchers share a single lock file in `config.codegen.outDir`. If another live process
 * already holds the lock, logs a warning and returns a no-op watcher.
 *
 * The optional `discoverRoutesImpl` parameter exists as a test seam: pass a stub to avoid
 * spawning a real NestJS app in unit tests.
 */
export async function watch(
  config: ResolvedConfig,
  onChange?: () => void,
  discoverRoutesImpl?: (opts: {
    moduleEntry: string;
    tsconfig?: string | undefined;
  }) => Promise<RouteDescriptor[]>,
): Promise<Watcher> {
  const lock = await acquireLock(config.codegen.outDir);

  if (lock === null) {
    console.warn(
      `[nestjs-inertia-codegen] already watching ${config.codegen.outDir} (another process holds the lock). Skipping.`,
    );
    return NO_OP_WATCHER;
  }

  // Run an initial generation pass so the output is up-to-date before any changes
  try {
    await generate(config);
  } catch {
    // Best-effort; don't crash the watcher on initial generation failure
  }

  // ── Pages watcher (fast path — no route discovery) ──────────────────────────
  let pagesDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  const pagesWatcher = chokidar.watch(join(config.codegen.cwd, config.pages.glob), {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });

  function schedulePagesRegenerate(): void {
    if (pagesDebounceTimer !== undefined) {
      clearTimeout(pagesDebounceTimer);
    }
    pagesDebounceTimer = setTimeout(async () => {
      pagesDebounceTimer = undefined;
      try {
        await generate(config);
      } catch {
        // Swallow errors in watch mode
      }
      onChange?.();
    }, PAGES_DEBOUNCE_MS);
  }

  pagesWatcher.on('add', schedulePagesRegenerate);
  pagesWatcher.on('change', schedulePagesRegenerate);
  pagesWatcher.on('unlink', schedulePagesRegenerate);

  // ── Contracts watcher (slow path — runs route discovery) ─────────────────────
  let contractsDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  const contractsWatcher = chokidar.watch(
    join(config.codegen.cwd, config.contracts.glob),
    {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    },
  );

  const resolvedDiscoverRoutes = discoverRoutesImpl ?? defaultDiscoverRoutes;

  // Static discovery is active by default (useStaticDiscovery defaults to true in resolved config).
  // It is bypassed when the user sets useStaticDiscovery: false, or when a custom discoverRoutesImpl
  // test seam is injected (the seam implies the caller controls discovery).
  const useStatic = config.contracts.useStaticDiscovery !== false && discoverRoutesImpl === undefined;

  function scheduleContractsRegenerate(): void {
    if (contractsDebounceTimer !== undefined) {
      clearTimeout(contractsDebounceTimer);
    }
    contractsDebounceTimer = setTimeout(async () => {
      contractsDebounceTimer = undefined;
      try {
        let routes: RouteDescriptor[] = [];

        if (useStatic) {
          // Fast path: static AST discovery via ts-morph — no NestJS bootstrap
          routes = await discoverContractsFast({
            cwd: config.codegen.cwd,
            glob: config.contracts.glob,
            tsconfig: config.app?.tsconfig ?? undefined,
          });
        } else {
          // Use the injected stub unconditionally (test seam), or only discover
          // when app config is present (production path).
          const hasCustomImpl = discoverRoutesImpl !== undefined;
          if (hasCustomImpl || config.app) {
            routes = await resolvedDiscoverRoutes({
              moduleEntry: config.app?.moduleEntry ?? '',
              tsconfig: config.app?.tsconfig ?? undefined,
            });
          }
          // else: no app config and no injected impl — re-emit empty routes below
        }

        await emitRoutes(routes, config.codegen.outDir);

        const hasContracts = routes.some((r) => r.contract);
        await emitIndex(config.codegen.outDir, hasContracts);

        if (hasContracts) {
          await emitApi(routes, config.codegen.outDir);
        }
      } catch {
        // Swallow errors in watch mode
      }
      onChange?.();
    }, config.contracts.debounceMs);
  }

  contractsWatcher.on('add', scheduleContractsRegenerate);
  contractsWatcher.on('change', scheduleContractsRegenerate);
  contractsWatcher.on('unlink', scheduleContractsRegenerate);

  return {
    close: async () => {
      if (pagesDebounceTimer !== undefined) {
        clearTimeout(pagesDebounceTimer);
        pagesDebounceTimer = undefined;
      }
      if (contractsDebounceTimer !== undefined) {
        clearTimeout(contractsDebounceTimer);
        contractsDebounceTimer = undefined;
      }
      await pagesWatcher.close();
      await contractsWatcher.close();
      await lock.release();
    },
  };
}
