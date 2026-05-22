import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function makeTmpManifest(contents: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-manifest-'));
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

export function makeNestedTmpManifest(contents: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-manifest-'));
  const sub = join(dir, 'dist/inertia/client/.vite');
  mkdirSync(sub, { recursive: true });
  const path = join(sub, 'manifest.json');
  writeFileSync(path, JSON.stringify(contents));
  return dir;
}
