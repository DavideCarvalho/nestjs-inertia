import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DiscoveredPage } from '../discovery/pages.js';

export interface CacheEntry {
  name: string;
  relativePath: string;
  mtime: string;
}

export interface ComponentsCache {
  pages: CacheEntry[];
}

export async function emitCache(pages: DiscoveredPage[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const entries: CacheEntry[] = await Promise.all(
    pages.map(async (p) => {
      const s = await stat(p.absolutePath);
      return {
        name: p.name,
        relativePath: p.relativePath,
        mtime: s.mtime.toISOString(),
      };
    }),
  );
  const cache: ComponentsCache = { pages: entries };
  await writeFile(join(outDir, 'components.json'), `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}
