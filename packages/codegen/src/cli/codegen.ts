import { loadConfig } from '../config/load-config.js';
import { generate } from '../generate.js';
import { watch } from '../watch/watcher.js';

export interface RunCodegenOptions {
  watch?: boolean;
  cwd?: string;
}

/**
 * Programmatic entry point for `nestjs-inertia codegen [--watch]`.
 *
 * - Loads `nestjs-inertia.config.ts` from `cwd`.
 * - Runs a single `generate()` pass.
 * - If `watch` is true, also starts the chokidar watcher and suspends
 *   until the process receives SIGINT/SIGTERM.
 *
 * Throws on config or generation errors (the CLI catches and returns exit code 1).
 */
export async function runCodegen(opts: RunCodegenOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd);
  await generate(config);

  if (opts.watch) {
    const watcher = await watch(config);

    await new Promise<void>((resolve) => {
      function onSignal() {
        watcher.close().then(resolve).catch(resolve);
      }
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    });
  }
}
