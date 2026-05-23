import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chokidar from 'chokidar';
import type { ResolvedConfig } from '../config/types.js';
import { discoverContractsFast } from '../discovery/contracts-fast.js';
import type { RouteDescriptor } from '../discovery/types.js';
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
 *    re-runs static AST route discovery via ts-morph, then re-emits `routes.ts` and (when
 *    contracts are present) `api.ts` + `index.d.ts`.
 *
 * Both watchers share a single lock file in `config.codegen.outDir`. If another live process
 * already holds the lock, logs a warning and returns a no-op watcher.
 */
export async function watch(config: ResolvedConfig, onChange?: () => void): Promise<Watcher> {
  const lock = await acquireLock(config.codegen.outDir);

  if (lock === null) {
    // Read the lock file to include the PID in the warning message
    let holderPid = 'unknown';
    try {
      const raw = await readFile(join(config.codegen.outDir, '.watcher.lock'), 'utf8');
      const data = JSON.parse(raw) as { pid?: number };
      if (data.pid !== undefined) holderPid = String(data.pid);
    } catch {
      // Lock file unreadable — fall back to generic warning
    }
    console.warn(
      `[nestjs-inertia-codegen] auto-watch skipped — another process (PID ${holderPid}) is already running the watcher in ${config.codegen.outDir}. Files will continue to regenerate from that process. To take over, stop the other watcher.`,
    );
    return NO_OP_WATCHER;
  }

  // Run an initial full pass: pages + routes + contracts (same as a one-shot `codegen` run)
  try {
    const initialRoutes = await discoverContractsFast({
      cwd: config.codegen.cwd,
      glob: config.contracts.glob,
      ...(config.app?.tsconfig ? { tsconfig: config.app.tsconfig } : {}),
    });
    await generate(config, initialRoutes);
  } catch (err) {
    // Best-effort; don't crash the watcher on initial generation failure
    console.warn(`[nestjs-inertia-codegen] Initial route discovery failed, falling back to pages-only: ${err instanceof Error ? err.message : String(err)}`);
    try { await generate(config); } catch { /* fallback: pages only */ }
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

  // ── Contracts watcher (static AST discovery via ts-morph) ────────────────────
  let contractsDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  const contractsWatcher = chokidar.watch(join(config.codegen.cwd, config.contracts.glob), {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });

  function scheduleContractsRegenerate(): void {
    if (contractsDebounceTimer !== undefined) {
      clearTimeout(contractsDebounceTimer);
    }
    contractsDebounceTimer = setTimeout(async () => {
      contractsDebounceTimer = undefined;
      try {
        const routes: RouteDescriptor[] = await discoverContractsFast({
          cwd: config.codegen.cwd,
          glob: config.contracts.glob,
          ...(config.app?.tsconfig ? { tsconfig: config.app.tsconfig } : {}),
        });

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
