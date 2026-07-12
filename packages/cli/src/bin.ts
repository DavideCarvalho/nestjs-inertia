#!/usr/bin/env node
import { renderDoctorReport, runDoctorChecks } from './doctor';
import { type Framework, applyInitPlan, nextStepsText, planInit, renderInitPlan } from './init';
import { fsTree } from './tree';

const USAGE = `nestjs-inertia — onboarding CLI for @dudousxd/nestjs-inertia

Usage:
  nestjs-inertia init             scaffold the current setup (shell, Vite entry, codegen config)
  nestjs-inertia init --dry-run   show what init would write, without writing
  nestjs-inertia init --force     overwrite files that already exist
  nestjs-inertia doctor           diagnose the setup (module, codegen wiring, versions, Vite)

Options:
  --framework <react|vue|svelte>  override framework detection (init)
  --cwd <path>                    project directory (default: current directory)

init never clobbers existing files without --force. doctor exits 1 when any check fails.
Docs: https://davidecarvalho.github.io/nestjs-inertia`;

const FRAMEWORKS: Framework[] = ['react', 'vue', 'svelte'];

function isFramework(value: string | undefined): value is Framework {
  return FRAMEWORKS.some((framework) => framework === value);
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command !== 'init' && command !== 'doctor') {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }

  let cwd = process.cwd();
  let framework: Framework | undefined;
  let force = false;
  let dryRun = false;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--cwd' && value) {
      cwd = value;
      i += 1;
    } else if (arg === '--framework') {
      if (!isFramework(value)) {
        console.error(`--framework must be one of: ${FRAMEWORKS.join(', ')}`);
        process.exit(1);
      }
      framework = value;
      i += 1;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  const tree = fsTree(cwd);

  if (command === 'doctor') {
    const report = renderDoctorReport(runDoctorChecks(tree));
    console.log(report.text);
    process.exit(report.exitCode);
  }

  const plan = planInit(tree, { framework, force });
  console.log(renderInitPlan(plan, dryRun));
  if (!dryRun) {
    applyInitPlan(plan, cwd);
    console.log('');
    console.log(nextStepsText(plan.framework));
  } else {
    console.log('');
    console.log('Dry run — nothing written. Re-run without --dry-run to apply.');
  }
}

main();
