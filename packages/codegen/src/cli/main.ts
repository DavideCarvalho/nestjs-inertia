import { cac } from 'cac';
import { VERSION } from '../index.js';
import { runCodegen } from './codegen.js';
import { runDoctor } from './doctor.js';
import { runInit } from './init.js';

/**
 * Parse `argv` (everything after `node <bin>`) and execute the matched command.
 *
 * Returns an exit code: 0 = success, 1 = error.
 *
 * Exported so tests can call `run(argv)` directly without spawning a subprocess.
 */
export async function run(argv: string[]): Promise<number> {
  const cli = cac('nestjs-inertia');

  cli
    .command('codegen', 'Generate typed artifacts from your NestJS + Inertia app')
    .option('--watch', 'Watch for file changes and re-generate automatically')
    .action(async (opts: { watch?: boolean }) => {
      await runCodegen({ watch: Boolean(opts.watch), cwd: process.cwd() });
    });

  cli
    .command('init', 'Initialise nestjs-inertia-codegen in the current project')
    .action(async () => {
      await runInit({ cwd: process.cwd() });
    });

  cli
    .command('doctor', 'Diagnose your nestjs-inertia setup')
    .option('--fix', 'Auto-fix issues where possible')
    .action(async (opts: { fix?: boolean }) => {
      const code = await runDoctor({ cwd: process.cwd(), fix: Boolean(opts.fix) });
      process.exitCode = code;
    });

  cli.help();
  cli.version(VERSION);

  try {
    // cac needs the first two argv entries to be 'node' and the binary name
    cli.parse(['node', 'nestjs-inertia', ...argv], { run: false });
    await cli.runMatchedCommand();
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[nestjs-inertia] Error: ${message}`);
    return 1;
  }
}
