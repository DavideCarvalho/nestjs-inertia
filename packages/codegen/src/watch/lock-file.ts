import { open } from 'node:fs/promises';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_FILE = '.watcher.lock';

interface LockData {
  pid: number;
  startedAt: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to acquire an exclusive lock for a watcher in `outDir`.
 *
 * Uses O_CREAT | O_EXCL (via 'wx' flag) for atomic file creation to prevent
 * TOCTOU race conditions between concurrent processes.
 *
 * Returns `{ release }` on success.
 * Returns `null` if another live process already holds the lock.
 */
export async function acquireLock(
  outDir: string,
): Promise<{ release: () => Promise<void> } | null> {
  await mkdir(outDir, { recursive: true });
  const lockPath = join(outDir, LOCK_FILE);

  const lockData: LockData = { pid: process.pid, startedAt: new Date().toISOString() };

  // Try atomic creation first (O_WRONLY | O_CREAT | O_EXCL)
  try {
    const fd = await open(lockPath, 'wx');
    await fd.writeFile(`${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
    await fd.close();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // File exists — check if holder is alive
      try {
        const raw = await readFile(lockPath, 'utf8');
        const existing = JSON.parse(raw) as LockData;
        if (isProcessAlive(existing.pid)) return null;
        // Stale lock — remove and retry
        await unlink(lockPath);
        return acquireLock(outDir);
      } catch {
        return null;
      }
    }
    return null;
  }

  return {
    release: async () => {
      try {
        await unlink(lockPath);
      } catch {
        // Ignore if already removed
      }
    },
  };
}
