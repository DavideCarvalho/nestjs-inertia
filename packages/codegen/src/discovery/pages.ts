import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
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

// Files matching these patterns are never treated as Inertia pages even if
// they sit inside the pages directory and would match the user's glob.
// Without this filter, vitest test files (`*.test.tsx`) get registered as
// pages, their imports get pulled into the typecheck graph, and any
// transitive matcher errors leak into the user's project.
const NON_PAGE_FILE_RE = /\.(?:test|spec|stories|story)\.(?:tsx?|jsx?|vue|svelte)$/i;

export async function discoverPages(opts: DiscoverPagesOptions): Promise<DiscoveredPage[]> {
  const allFiles = await fg(opts.glob, { cwd: opts.cwd, absolute: true });
  const files = allFiles.filter((f) => !NON_PAGE_FILE_RE.test(f));
  files.sort();
  // Extract the static prefix from the glob to make page names relative to the pages directory
  // e.g. glob 'inertia/pages/**/*.tsx' → pagesBase 'inertia/pages'
  const globStatic = opts.glob.split('*')[0]?.replace(/\/$/, '') ?? '';
  const pagesBase = join(opts.cwd, globStatic);
  const out: DiscoveredPage[] = [];
  for (const file of files) {
    const rel = relative(opts.cwd, file);
    const nameRel = relative(pagesBase, file);
    const name = computeName(nameRel, opts.componentNameStrategy);
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
