import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireLock } from '../../src/watch/lock-file.js';

describe('acquireLock', () => {
  let tmpBase: string;

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'lock-file-spec-'));
  });

  afterEach(async () => {
    if (tmpBase) {
      await rm(tmpBase, { recursive: true, force: true });
    }
  });

  it('acquires a fresh lock and writes a JSON lock file with pid and startedAt', async () => {
    const outDir = join(tmpBase, 'out');
    const result = await acquireLock(outDir);

    expect(result).not.toBeNull();

    // Verify the lock file was written with expected content
    const raw = await readFile(join(outDir, '.watcher.lock'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);
    expect(typeof data.startedAt).toBe('string');
    // startedAt should be a valid ISO date string
    expect(new Date(data.startedAt).toISOString()).toBe(data.startedAt);

    // Clean up
    await result!.release();
  });

  it('release removes the lock file', async () => {
    const outDir = join(tmpBase, 'out');
    const result = await acquireLock(outDir);
    expect(result).not.toBeNull();

    await result!.release();

    // Lock file should be gone
    await expect(readFile(join(outDir, '.watcher.lock'), 'utf8')).rejects.toThrow();
  });

  it('release is idempotent (does not throw if file already removed)', async () => {
    const outDir = join(tmpBase, 'out');
    const result = await acquireLock(outDir);
    expect(result).not.toBeNull();

    await result!.release();
    // Second release should not throw
    await expect(result!.release()).resolves.toBeUndefined();
  });

  it('returns null when another live process holds the lock', async () => {
    const outDir = join(tmpBase, 'out');
    const first = await acquireLock(outDir);
    expect(first).not.toBeNull();

    // The current process is alive, so a second acquire should return null
    const second = await acquireLock(outDir);
    expect(second).toBeNull();

    await first!.release();
  });

  it('reclaims a stale lock left by a dead process', async () => {
    const outDir = join(tmpBase, 'out');
    await mkdir(outDir, { recursive: true });

    // Write a lock file with a PID that does not exist
    const fakePid = 999999;
    const lockData = { pid: fakePid, startedAt: new Date().toISOString() };
    await writeFile(
      join(outDir, '.watcher.lock'),
      `${JSON.stringify(lockData, null, 2)}\n`,
      'utf8',
    );

    // acquireLock should detect the stale lock, remove it, and succeed
    const result = await acquireLock(outDir);
    expect(result).not.toBeNull();

    // Verify the lock file now has our pid
    const raw = await readFile(join(outDir, '.watcher.lock'), 'utf8');
    const data = JSON.parse(raw);
    expect(data.pid).toBe(process.pid);

    await result!.release();
  });

  it('returns null when existing lock file contains invalid JSON', async () => {
    const outDir = join(tmpBase, 'out');
    await mkdir(outDir, { recursive: true });

    // Write a lock file with invalid JSON content
    await writeFile(join(outDir, '.watcher.lock'), 'not valid json!!!', 'utf8');

    // acquireLock should hit the inner catch (line 53-55) and return null
    const result = await acquireLock(outDir);
    expect(result).toBeNull();
  });

  it('creates outDir recursively if it does not exist', async () => {
    const outDir = join(tmpBase, 'deep', 'nested', 'dir');
    const result = await acquireLock(outDir);
    expect(result).not.toBeNull();

    // Verify the directory and lock file exist
    const raw = await readFile(join(outDir, '.watcher.lock'), 'utf8');
    expect(JSON.parse(raw).pid).toBe(process.pid);

    await result!.release();
  });
});
