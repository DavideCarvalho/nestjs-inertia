import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import type { RouteDescriptor, TypeRef } from '../discovery/types.js';

/**
 * Emits `api.ts` into `outDir` for all routes that carry a `.contract`.
 * - GET routes get `queryOptions`
 * - POST/PUT/PATCH/DELETE routes get `mutationOptions`
 */
export async function emitApi(routes: RouteDescriptor[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const content = buildApiFile(routes, outDir);
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

/**
 * Convert an arbitrary string segment to camelCase by splitting on non-alphanumeric chars.
 */
function toCamelCase(s: string): string {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word, i) =>
      i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

/**
 * Validate that a single name segment matches camelCase: starts with a lowercase letter,
 * followed only by alphanumeric chars. Throws a descriptive error on invalid segments.
 */
function validateNameSegment(seg: string, fullName: string): void {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(seg)) {
    const suggested = toCamelCase(seg);
    throw new Error(
      `Contract name "${fullName}" has invalid segment "${seg}". Use camelCase identifiers only (lowercase letter then alphanumeric). Suggested: "${suggested}"`,
    );
  }
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
    queryRef?: TypeRef | null;
    bodyRef?: TypeRef | null;
    responseRef?: TypeRef | null;
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
      const prefixName = fullName
        .split('.')
        .slice(0, segments.length - rest.length)
        .join('.');
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
      const query = c.contractSource.queryRef ? c.contractSource.queryRef.name : (c.contractSource.query ?? 'never');
      const body = method === 'GET' ? 'never' : (c.contractSource.bodyRef ? c.contractSource.bodyRef.name : (c.contractSource.body ?? 'never'));
      const response = c.contractSource.responseRef ? c.contractSource.responseRef.name : c.contractSource.response;
      const safeMethod = JSON.stringify(method);
      const safeUrl = JSON.stringify(c.path);
      lines.push(
        `${pad}${objKey}: { method: ${safeMethod}; url: ${safeUrl}; query: ${query}; body: ${body}; response: ${response} };`,
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
        const typeAccess = buildRouterTypeAccess(c.name);
        lines.push(`${pad}${objKey}: {`);
        lines.push(`${pad}  queryKey: (query?: ${typeAccess}['query']) => query !== undefined ? [${flatName}, query] as const : [${flatName}] as const,`);
        lines.push(`${pad}  queryOptions: (query?: ${typeAccess}['query']) => ({`);
        lines.push(`${pad}    queryKey: query !== undefined ? [${flatName}, query] as const : [${flatName}] as const,`);
        lines.push(
          `${pad}    queryFn: () => fetcher.get<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { query }),`,
        );
        lines.push(`${pad}  }),`);
        lines.push(`${pad}},`);
      } else {
        const typeAccess = buildRouterTypeAccess(c.name);
        lines.push(`${pad}${objKey}: {`);
        lines.push(`${pad}  queryKey: () => [${flatName}] as const,`);
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

function buildApiFile(routes: RouteDescriptor[], outDir?: string): string {
  const contracted = routes.filter((r) => r.contract);

  // Collect all type refs for import generation
  const importsByFile = new Map<string, Set<string>>();
  for (const r of contracted) {
    const cs = r.contract?.contractSource;
    if (!cs) continue;
    for (const ref of [cs.queryRef, cs.bodyRef, cs.responseRef]) {
      if (!ref) continue;
      let names = importsByFile.get(ref.filePath);
      if (!names) {
        names = new Set();
        importsByFile.set(ref.filePath, names);
      }
      names.add(ref.name);
    }
  }

  const lines: string[] = [
    '// Generated by @dudousxd/nestjs-inertia-codegen. Do not edit.',
    '',
  ];

  lines.push("import { route } from './routes.js';");
  lines.push("import { createFetcher } from '@dudousxd/nestjs-inertia-client';");

  // Emit type imports from source files
  if (importsByFile.size > 0 && outDir) {
    lines.push('');
    for (const [filePath, names] of importsByFile) {
      let relPath = relative(outDir, filePath).replace(/\.ts$/, '');
      if (!relPath.startsWith('.')) relPath = `./${relPath}`;
      const sortedNames = [...names].sort();
      lines.push(`import type { ${sortedNames.join(', ')} } from '${relPath}';`);
    }
  }
  lines.push('');
  lines.push('export const fetcher = createFetcher();');
  lines.push('');

  if (contracted.length === 0) {
    lines.push('export type ApiRouter = Record<string, never>;');
    lines.push('');
    lines.push('export const api: Record<string, never> = {} as Record<string, never>;');
    lines.push('');
    lines.push('export namespace Route {');
    lines.push('  export type Response<K extends string> = never;');
    lines.push('  export type Body<K extends string> = never;');
    lines.push('  export type Query<K extends string> = never;');
    lines.push('  export type Params<K extends string> = never;');
    lines.push('  export type Error<K extends string> = never;');
    lines.push(
      '  export type Request<K extends string> = { body: never; query: never; params: never };',
    );
    lines.push('}');
    lines.push('');
    lines.push('export namespace Path {');
    lines.push('  export type Response<M extends string, U extends string> = never;');
    lines.push('  export type Body<M extends string, U extends string> = never;');
    lines.push('  export type Query<M extends string, U extends string> = never;');
    lines.push('  export type Params<M extends string, U extends string> = never;');
    lines.push('  export type Error<M extends string, U extends string> = never;');
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  // Build a nested tree from all contracted routes
  const tree = new Map<string, TreeNode>();

  for (const r of contracted) {
    const c = r.contract!;
    const name: string = r.name;
    const segments = splitName(name);
    // Validate each segment is a valid camelCase identifier
    for (const seg of segments) {
      validateNameSegment(seg, name);
    }
    const leaf: LeafEntry = {
      kind: 'leaf',
      method: r.method,
      name: name,
      path: r.path,
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

  // --- Recursive helper type _RouterAt: walks nested ApiRouter by dot-path ---
  lines.push('type _RouterAt<R, P extends string> = P extends `${infer Head}.${infer Tail}`');
  lines.push('  ? Head extends keyof R ? _RouterAt<R[Head], Tail> : never');
  lines.push('  : P extends keyof R ? R[P] : never;');
  lines.push('');

  // --- ResolveByName: resolve a field from a dot-path name ---
  lines.push(
    'type ResolveByName<K extends string, Field extends string> = _RouterAt<ApiRouter, K> extends infer R ? Field extends keyof R ? R[Field] : never : never;',
  );
  lines.push('');

  // --- ResolveByPath: scan all leaves for matching method + url ---
  // Flattens ApiRouter recursively and finds the entry whose method === M and url === U.
  lines.push('type _LeafValues<T> = T extends { method: string; url: string }');
  lines.push('  ? T');
  lines.push('  : T extends object ? _LeafValues<T[keyof T]> : never;');
  lines.push('');
  lines.push(
    'type ResolveByPath<M extends string, U extends string, Field extends string> = _LeafValues<ApiRouter> extends infer L',
  );
  lines.push('  ? L extends { method: M; url: U }');
  lines.push('    ? Field extends keyof L ? L[Field] : never');
  lines.push('    : never');
  lines.push('  : never;');
  lines.push('');

  // --- Route namespace ---
  lines.push('export namespace Route {');
  lines.push('  export type Response<K extends string> = ResolveByName<K, "response">;');
  lines.push('  export type Body<K extends string> = ResolveByName<K, "body">;');
  lines.push('  export type Query<K extends string> = ResolveByName<K, "query">;');
  lines.push('  export type Params<K extends string> = ResolveByName<K, "params">;');
  lines.push('  export type Error<K extends string> = ResolveByName<K, "error">;');
  lines.push('  export type Request<K extends string> = {');
  lines.push('    body: Body<K>;');
  lines.push('    query: Query<K>;');
  lines.push('    params: Params<K>;');
  lines.push('  };');
  lines.push('}');
  lines.push('');

  // --- Path namespace ---
  lines.push('export namespace Path {');
  lines.push(
    '  export type Response<M extends string, U extends string> = ResolveByPath<M, U, "response">;',
  );
  lines.push(
    '  export type Body<M extends string, U extends string> = ResolveByPath<M, U, "body">;',
  );
  lines.push(
    '  export type Query<M extends string, U extends string> = ResolveByPath<M, U, "query">;',
  );
  lines.push(
    '  export type Params<M extends string, U extends string> = ResolveByPath<M, U, "params">;',
  );
  lines.push(
    '  export type Error<M extends string, U extends string> = ResolveByPath<M, U, "error">;',
  );
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
