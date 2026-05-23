import { loadConfig } from '../config/load-config.js';
import { discoverContractsFast } from '../discovery/contracts-fast.js';
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
 * - In one-shot mode: discovers routes via static AST, then generates all artifacts.
 * - If `watch` is true, delegates entirely to the chokidar watcher (which
 *   handles its own route discovery internally) and suspends until SIGINT/SIGTERM.
 *
 * Throws on config or generation errors (the CLI catches and returns exit code 1).
 */
export async function runCodegen(opts: RunCodegenOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  if (opts.watch) {
    const watcher = await watch(config);

    await new Promise<void>((resolve) => {
      function onSignal() {
        watcher.close().then(resolve).catch(resolve);
      }
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
    });
    return;
  }

  // One-shot: discover routes via static AST, then generate all artifacts.
  const routes = await discoverContractsFast({
    cwd: config.codegen.cwd,
    glob: config.contracts.glob,
    ...(config.app?.tsconfig ? { tsconfig: config.app.tsconfig } : {}),
  });

  await generate(config, routes);
  console.log('✓ Codegen generated artifacts in', config.codegen.outDir);
}
