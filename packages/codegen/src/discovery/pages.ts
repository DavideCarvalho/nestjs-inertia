import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import fg from 'fast-glob';

export interface DiscoveredPage {
  name: string;
  absolutePath: string;
  relativePath: string;
  propsSource: string | null;
}

export interface DiscoverPagesOptions {
  glob: string;
  cwd: string;
  propsExport: string;
  componentNameStrategy: 'relative-no-ext' | 'kebab' | ((path: string) => string);
}

export async function discoverPages(opts: DiscoverPagesOptions): Promise<DiscoveredPage[]> {
  const files = await fg(opts.glob, { cwd: opts.cwd, absolute: true });
  files.sort();
  const out: DiscoveredPage[] = [];
  for (const file of files) {
    const rel = relative(opts.cwd, file);
    const name = computeName(rel, opts.componentNameStrategy);
    const source = await readFile(file, 'utf8');
    const propsSource = extractPropsSource(source, opts.propsExport);
    out.push({ name, absolutePath: file, relativePath: rel, propsSource });
  }
  return out;
}

function computeName(rel: string, strat: DiscoverPagesOptions['componentNameStrategy']): string {
  if (typeof strat === 'function') return strat(rel);
  const noExt = rel.replace(/\.(tsx?|vue|svelte)$/, '');
  if (strat === 'kebab') return noExt.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return noExt;
}

function extractPropsSource(source: string, exportName: string): string | null {
  const re = new RegExp(`export\\s+type\\s+${exportName}\\s*=\\s*`, 'm');
  const m = source.match(re);
  if (!m) return null;
  const start = m.index! + m[0].length;
  // Brace counting to capture type body
  let i = start;
  let depth = 0;
  let started = false;
  while (i < source.length) {
    const c = source[i];
    if (c === '{') {
      depth++;
      started = true;
    } else if (c === '}') {
      depth--;
      if (started && depth === 0) {
        return source.slice(start, i + 1);
      }
    } else if (c === ';' && !started) return source.slice(start, i);
    i++;
  }
  return source.slice(start);
}
