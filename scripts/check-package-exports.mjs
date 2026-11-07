#!/usr/bin/env node
/**
 * Fails when a package.json points at a file that does not exist on disk.
 *
 * Checks every path in `main`, `module`, `types`, `typings`, `bin` and every leaf of `exports`
 * (conditions, nested conditions, arrays). Subpath patterns (`./*`) must match at least one file.
 *
 * Usage:
 *   node scripts/check-package-exports.mjs            # the package in the current directory (prepack)
 *   node scripts/check-package-exports.mjs <dir>...   # the given package directories
 *   node scripts/check-package-exports.mjs --all      # every non-private package under packages/
 *
 * Why: a build can finish "successfully" yet leave out a declared entry (e.g. two tsup passes racing
 * on `clean`, or a stale tsc `.tsbuildinfo`), and `npm pack` happily packs the hole. This makes the
 * hole a hard failure before anything is packed or published.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function collectTargets(value, where, out) {
  if (value == null) return;
  if (typeof value === 'string') {
    out.push({ where, target: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectTargets(v, `${where}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value))
      collectTargets(v, `${where}[${JSON.stringify(key)}]`, out);
  }
}

function patternMatches(pkgDir, target) {
  // `./dist/*.js` → any file under dist/ whose relative path fits the pattern.
  const [prefix, suffix] = target.split('*');
  const base = join(pkgDir, prefix);
  const baseDir = prefix.endsWith('/') ? base : dirname(base);
  if (!existsSync(baseDir)) return false;
  const stack = [baseDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (full.startsWith(base) && full.endsWith(suffix)) return true;
    }
  }
  return false;
}

function checkPackage(pkgDir) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const targets = [];
  for (const field of ['main', 'module', 'types', 'typings'])
    collectTargets(pkg[field], field, targets);
  collectTargets(pkg.bin, 'bin', targets);
  collectTargets(pkg.exports, 'exports', targets);

  const missing = [];
  for (const { where, target } of targets) {
    const ok = target.includes('*')
      ? patternMatches(pkgDir, target)
      : existsSync(join(pkgDir, target));
    if (!ok) missing.push(`${where} → ${target}`);
  }
  return { name: pkg.name ?? relative(repoRoot, pkgDir), private: pkg.private === true, missing };
}

function listWorkspacePackages() {
  const dir = join(repoRoot, 'packages');
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'package.json')));
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const dirs = all
  ? listWorkspacePackages()
  : args.filter((a) => !a.startsWith('--')).map((a) => resolve(a));
if (dirs.length === 0) dirs.push(process.cwd());

let failed = 0;
for (const dir of dirs) {
  const result = checkPackage(dir);
  if (all && result.private) continue;
  if (result.missing.length) {
    failed++;
    console.error(`✖ ${result.name}: package.json points at files that do not exist:`);
    for (const m of result.missing) console.error(`    ${m}`);
  }
}
if (failed) {
  console.error(
    `\n${failed} package(s) would be packed with missing entry files. Rebuild them (clean) and retry.`,
  );
  process.exit(1);
}
if (all) console.log(`✔ every declared entry exists (${dirs.length} packages checked)`);
