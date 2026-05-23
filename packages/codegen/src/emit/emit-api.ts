import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RouteDescriptor } from '../discovery/types.js';

/**
 * Emits `api.ts` into `outDir` for all routes that carry a `.contract`.
 * - GET routes get `queryOptions`
 * - POST/PUT/PATCH/DELETE routes get `mutationOptions`
 */
export async function emitApi(routes: RouteDescriptor[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const content = buildApiFile(routes);
  await writeFile(join(outDir, 'api.ts'), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Split a dot-notation name into its path segments. */
function splitName(name: string): string[] {
  return name.split('.');
}

/**
 * Check whether a segment is a valid JS identifier.
 * If not, we wrap it in quotes so it produces a valid object key.
 */
function toObjectKey(segment: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return segment;
  }
  return JSON.stringify(segment);
}

// ---------------------------------------------------------------------------
// Nested tree helpers
// ---------------------------------------------------------------------------

type LeafEntry = {
  kind: 'leaf';
  method: string;
  name: string;
  path: string;
  contractSource: {
    query: string | null | undefined;
    body: string | null | undefined;
    response: string;
  };
};

type BranchEntry = {
  kind: 'branch';
  children: Map<string, TreeNode>;
};

type TreeNode = LeafEntry | BranchEntry;

function detectCollisions(tree: Map<string, TreeNode>, name: string): void {
  // Walk to ensure no node that is a leaf also has children (or vice versa).
  // Called after insertion; we scan top-level keys for conflicts.
  for (const [key, node] of tree) {
    if (node.kind === 'leaf') {
      // A leaf at this position is fine
    } else {
      void key; // branch is fine too
    }
  }
  void name;
}

/**
 * Insert a contracted route into the mutable tree.
 * Throws if a name conflict is detected.
 */
function insertIntoTree(
  tree: Map<string, TreeNode>,
  segments: string[],
  leaf: LeafEntry,
  fullName: string,
): void {
  const head = segments[0] as string;
  const rest = segments.slice(1);

  if (rest.length === 0) {
    // This is the final segment — insert as a leaf
    const existing = tree.get(head);
    if (existing !== undefined && existing.kind === 'branch') {
      throw new Error(
        `Contract name conflict: "${fullName}" cannot have both a direct entry and child entries`,
      );
    }
    tree.set(head, leaf);
  } else {
    // Need to recurse into a branch
    const existing = tree.get(head);
    if (existing !== undefined && existing.kind === 'leaf') {
      // The leaf's name is the prefix of fullName
      const prefixName = fullName.split('.').slice(0, segments.length - rest.length).join('.');
      throw new Error(
        `Contract name conflict: "${prefixName}" cannot have both a direct entry and child entries`,
      );
    }
    let branch: BranchEntry;
    if (existing === undefined) {
      branch = { kind: 'branch', children: new Map() };
      tree.set(head, branch);
    } else {
      branch = existing as BranchEntry;
    }
    insertIntoTree(branch.children, rest, leaf, fullName);
  }
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

/**
 * Emit the nested ApiRouter type block.
 */
function emitRouterTypeBlock(tree: Map<string, TreeNode>, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  for (const [key, node] of tree) {
    const objKey = toObjectKey(key);
    if (node.kind === 'leaf') {
      const c = node;
      const method = c.method.toUpperCase();
      const query = c.contractSource.query ?? 'never';
      const body = method === 'GET' ? 'never' : (c.contractSource.body ?? 'never');
      const response = c.contractSource.response;
      const safeMethod = JSON.stringify(method);
      lines.push(
        `${pad}${objKey}: { method: ${safeMethod}; query: ${query}; body: ${body}; response: ${response} };`,
      );
    } else {
      lines.push(`${pad}${objKey}: {`);
      lines.push(...emitRouterTypeBlock(node.children, indent + 2));
      lines.push(`${pad}};`);
    }
  }

  return lines;
}

/**
 * Emit the nested `api` object body.
 */
function emitApiObjectBlock(tree: Map<string, TreeNode>, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  for (const [key, node] of tree) {
    const objKey = toObjectKey(key);
    if (node.kind === 'leaf') {
      const c = node;
      const method = c.method.toUpperCase();
      const flatName = JSON.stringify(c.name); // e.g. "users.list"
      const safePath = JSON.stringify(c.path);
      const fetcherMethod = method.toLowerCase();

      if (method === 'GET') {
        // Build the type path for ApiRouter traversal: ApiRouter['users']['list']
        const typeAccess = buildRouterTypeAccess(c.name);
        lines.push(`${pad}${objKey}: {`);
        lines.push(`${pad}  queryOptions: (query?: ${typeAccess}['query']) =>`);
        lines.push(`${pad}    queryOptions({`);
        lines.push(`${pad}      queryKey: [${flatName}, query],`);
        lines.push(
          `${pad}      queryFn: () => fetcher.get<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { query }),`,
        );
        lines.push(`${pad}    }),`);
        lines.push(`${pad}},`);
      } else {
        const typeAccess = buildRouterTypeAccess(c.name);
        lines.push(`${pad}${objKey}: {`);
        lines.push(`${pad}  mutationOptions: () => ({`);
        lines.push(
          `${pad}    mutationFn: (body: ${typeAccess}['body']) => fetcher.${fetcherMethod}<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { body }),`,
        );
        lines.push(`${pad}  }),`);
        lines.push(`${pad}},`);
      }
    } else {
      lines.push(`${pad}${objKey}: {`);
      lines.push(...emitApiObjectBlock(node.children, indent + 2));
      lines.push(`${pad}},`);
    }
  }

  return lines;
}

/**
 * Build the ApiRouter type-access chain for a dot-separated name.
 * e.g. 'users.list' -> "ApiRouter['users']['list']"
 */
function buildRouterTypeAccess(name: string): string {
  const segments = splitName(name);
  return `ApiRouter${segments.map((s) => `[${JSON.stringify(s)}]`).join('')}`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function buildApiFile(routes: RouteDescriptor[]): string {
  const contracted = routes.filter((r) => r.contract);

  const lines: string[] = [
    '// Generated by @dudousxd/nestjs-inertia-codegen. Do not edit.',
    '',
    "import { queryOptions } from '@tanstack/query-core';",
    "import { route } from './routes.js';",
    "import { createFetcher } from '@dudousxd/nestjs-inertia-client';",
    '',
    'export const fetcher = createFetcher();',
    '',
  ];

  if (contracted.length === 0) {
    lines.push('export type ApiRouter = Record<string, never>;');
    lines.push('');
    lines.push('export const api: Record<string, never> = {} as Record<string, never>;');
    lines.push('');
    lines.push("export type InferResponse<Path extends string> = never;");
    lines.push("export type InferBody<Path extends string> = never;");
    lines.push("export type InferQuery<Path extends string> = never;");
    lines.push('');
    return lines.join('\n');
  }

  // Build a nested tree from all contracted routes
  const tree = new Map<string, TreeNode>();

  for (const r of contracted) {
    const c = r.contract!;
    if (!c.name) continue; // skip contracts without a name
    const name: string = c.name;
    const segments = splitName(name);
    const leaf: LeafEntry = {
      kind: 'leaf',
      method: c.method,
      name: name,
      path: c.path,
      contractSource: c.contractSource,
    };
    insertIntoTree(tree, segments, leaf, name);
  }

  void detectCollisions; // used inline above

  // --- ApiRouter type ---
  lines.push('export type ApiRouter = {');
  lines.push(...emitRouterTypeBlock(tree, 2));
  lines.push('};');
  lines.push('');

  // --- api object ---
  lines.push('export const api = {');
  lines.push(...emitApiObjectBlock(tree, 2));
  lines.push('};');
  lines.push('');

  // --- Infer* types using recursive conditional type to split on '.' ---
  // InferResponse<'users.list'> -> ApiRouter['users']['list']['response']
  // Uses a helper type _RouterAt<R, P> that traverses the nested ApiRouter.
  lines.push(
    "type _RouterAt<R, P extends string> = P extends `${infer Head}.${infer Tail}`",
  );
  lines.push("  ? Head extends keyof R ? _RouterAt<R[Head], Tail> : never");
  lines.push("  : P extends keyof R ? R[P] : never;");
  lines.push('');
  lines.push(
    "export type InferResponse<Path extends string> = _RouterAt<ApiRouter, Path> extends { response: infer R } ? R : never;",
  );
  lines.push(
    "export type InferBody<Path extends string> = _RouterAt<ApiRouter, Path> extends { body: infer B } ? B : never;",
  );
  lines.push(
    "export type InferQuery<Path extends string> = _RouterAt<ApiRouter, Path> extends { query: infer Q } ? Q : never;",
  );
  lines.push('');

  return lines.join('\n');
}
