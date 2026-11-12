#!/usr/bin/env node
/**
 * Lints every published package the way a consumer would install it: `publint` checks the
 * package.json against the files that ship, and `@arethetypeswrong/cli` resolves the types of
 * every export from the packed tarball (the `node16` profile for a package that ships CommonJS,
 * `esm-only` for an ESM-only one). Run after the build.
 *
 * Usage:
 *   node scripts/check-package.mjs            # every non-private package under packages/
 *   node scripts/check-package.mjs <dir>...   # the given package directories
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(repoRoot, 'node_modules', '.bin', name);

const args = process.argv.slice(2);
const dirs =
  args.length > 0
    ? args.map((d) => resolve(d))
    : readdirSync(join(repoRoot, 'packages'))
        .map((d) => join(repoRoot, 'packages', d))
        .filter((d) => existsSync(join(d, 'package.json')));

let failed = 0;
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.private === true) continue;
  console.log(`\n▸ ${pkg.name}`);
  const out = mkdtempSync(join(tmpdir(), 'check-package-'));
  let step = 'publint';
  try {
    execFileSync(bin('publint'), ['run', '--strict', dir], { stdio: 'inherit' });
    step = 'pnpm pack';
    execFileSync('pnpm', ['pack', '--pack-destination', out], {
      cwd: dir,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const tarball = readdirSync(out).find((f) => f.endsWith('.tgz'));
    if (!tarball) throw new Error(`pnpm pack produced no tarball in ${out}`);
    step = 'attw';
    // A package that ships CommonJS (a `require` entry, or a CommonJS package) must resolve from
    // both ESM and CommonJS (`node16` profile: TypeScript's legacy `node10` resolution ignores
    // `exports` subpaths and is not a supported consumer setup). An ESM-only package uses `esm-only`.
    const esmOnly =
      pkg.type === 'module' && !JSON.stringify(pkg.exports ?? {}).includes('"require"');
    const profile = ['--profile', esmOnly ? 'esm-only' : 'node16'];
    // Run from the package directory so a package's own `.attw.json` (e.g. an entrypoint that
    // only resolves under the `node` condition, excluded on purpose) is picked up.
    execFileSync(bin('attw'), [join(out, tarball), ...profile, '--format', 'table'], {
      cwd: dir,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`✖ ${pkg.name}: ${step} failed${error?.message ? ` — ${error.message}` : ''}`);
    failed++;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed the package checks.`);
  process.exit(1);
}
