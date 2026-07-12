import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal read-only view of a project directory. `init` planning and every `doctor` check are
 * pure functions over this interface, so tests exercise them against in-memory fixture trees
 * (see `memoryTree`) and the bin wires them to the real filesystem (see `fsTree`).
 */
export interface ProjectTree {
  /** True for an existing file at `path`, or a directory containing at least one file. */
  exists(path: string): boolean;
  /** File contents, or null when the file does not exist / cannot be read. */
  read(path: string): string | null;
}

/** A `ProjectTree` over an in-memory `relativePath → contents` map, for tests. */
export function memoryTree(files: Record<string, string>): ProjectTree {
  return {
    exists(path: string): boolean {
      if (path in files) return true;
      const prefix = path.endsWith('/') ? path : `${path}/`;
      return Object.keys(files).some((key) => key.startsWith(prefix));
    },
    read(path: string): string | null {
      return files[path] ?? null;
    },
  };
}

/** A `ProjectTree` over the real filesystem, rooted at `cwd`. */
export function fsTree(cwd: string): ProjectTree {
  return {
    exists(path: string): boolean {
      return existsSync(join(cwd, path));
    },
    read(path: string): string | null {
      try {
        return readFileSync(join(cwd, path), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Parse a JSON file from the tree, or null when missing/invalid. */
export function readJson(tree: ProjectTree, path: string): Record<string, unknown> | null {
  const raw = tree.read(path);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Installed version of a package (from `node_modules/<name>/package.json`), or null. */
export function installedVersion(tree: ProjectTree, name: string): string | null {
  const pkg = readJson(tree, `node_modules/${name}/package.json`);
  const version = pkg?.version;
  return typeof version === 'string' ? version : null;
}
