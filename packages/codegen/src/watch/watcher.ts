import { join } from 'node:path';
import chokidar from 'chokidar';
import type { ResolvedConfig } from '../config/types.js';
import { generate } from '../generate.js';
import { acquireLock } from './lock-file.js';

const DEBOUNCE_MS = 150;

export interface Watcher {
  close(): Promise<void>;
}

/** No-op watcher returned when the lock is already held. */
const NO_OP_WATCHER: Watcher = { close: async () => {} };

/**
 * Start a chokidar watcher over `config.pages.glob`.
 *
 * - Acquires a lock in `config.codegen.outDir`; if another live process already
 *   holds the lock, logs a warning and returns a no-op watcher.
 * - On any file change, debounces 150 ms then runs `generate(config)` and
 *   calls `onChange?.()`.
 * - Releases the lock when the watcher is closed.
 */
export async function watch(config: ResolvedConfig, onChange?: () => void): Promise<Watcher> {
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

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const fsWatcher = chokidar.watch(join(config.codegen.cwd, config.pages.glob), {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });

  function scheduleRegenerate(): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      debounceTimer = undefined;
      try {
        await generate(config);
      } catch {
        // Swallow errors in watch mode
      }
      onChange?.();
    }, DEBOUNCE_MS);
  }

  fsWatcher.on('add', scheduleRegenerate);
  fsWatcher.on('change', scheduleRegenerate);
  fsWatcher.on('unlink', scheduleRegenerate);

  return {
    close: async () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      await fsWatcher.close();
      await lock.release();
    },
  };
}
