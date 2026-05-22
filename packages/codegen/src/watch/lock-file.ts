import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
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
 * Returns `{ release }` on success.
 * Returns `null` if another live process already holds the lock.
 */
export async function acquireLock(outDir: string): Promise<{ release: () => Promise<void> } | null> {
  await mkdir(outDir, { recursive: true });
  const lockPath = join(outDir, LOCK_FILE);

  // Check for an existing lock
  try {
    const raw = await readFile(lockPath, 'utf8');
    const existing = JSON.parse(raw) as LockData;
    if (isProcessAlive(existing.pid)) {
      // Another live process holds the lock
      return null;
    }
    // Stale lock — fall through to overwrite
  } catch {
    // File doesn't exist or is corrupt — fall through to create
  }

  const lockData: LockData = { pid: process.pid, startedAt: new Date().toISOString() };
  await writeFile(lockPath, JSON.stringify(lockData, null, 2) + '\n', 'utf8');

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
