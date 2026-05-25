import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { ControllerRef, RouteDescriptor, TypeRef } from '../discovery/types.js';

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
  params: Array<{ name: string; source: string }>;
  controllerRef?: ControllerRef;
  contractSource: {
    query: string | null | undefined;
    body: string | null | undefined;
    response: string;
    queryRef?: TypeRef | null;
    bodyRef?: TypeRef | null;
    responseRef?: TypeRef | null;
    filterFields?: string[] | null;
  };
};

type BranchEntry = {
  kind: 'branch';
  children: Map<string, TreeNode>;
};

type TreeNode = LeafEntry | BranchEntry;

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
// Params helpers
// ---------------------------------------------------------------------------

/**
 * Build a TypeScript type literal for path params.
 * Returns 'never' when the route has no path params.
 */
function buildParamsType(params: Array<{ name: string; source: string }>): string {
  const pathParams = params.filter((p) => p.source === 'path');
  if (pathParams.length === 0) return 'never';
  return `{ ${pathParams.map((p) => `${p.name}: string`).join('; ')} }`;
}

/**
 * Check whether a route has any path params.
 */
function hasPathParams(params: Array<{ name: string; source: string }>): boolean {
  return params.some((p) => p.source === 'path');
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

/**
 * Emit the nested ApiRouter type block.
 */
function buildResponseType(c: LeafEntry, outDir: string): string {
  if (c.controllerRef) {
    let relPath = relative(outDir, c.controllerRef.filePath).replace(/\.ts$/, '');
    if (!relPath.startsWith('.')) relPath = `./${relPath}`;
    return `Awaited<ReturnType<import('${relPath}').${c.controllerRef.className}['${c.controllerRef.methodName}']>>`;
  }
  const respRef = c.contractSource.responseRef;
  if (respRef) {
    return respRef.isArray ? `Array<${respRef.name}>` : respRef.name;
  }
  return c.contractSource.response;
}

function emitRouterTypeBlock(
  tree: Map<string, TreeNode>,
  indent: number,
  outDir: string,
): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  for (const [key, node] of tree) {
    const objKey = toObjectKey(key);
    if (node.kind === 'leaf') {
      const c = node;
      const method = c.method.toUpperCase();
      const queryRef = c.contractSource.queryRef;
      const query = queryRef
        ? queryRef.isArray
          ? `Array<${queryRef.name}>`
          : queryRef.name
        : (c.contractSource.query ?? 'never');
      const bodyRef = c.contractSource.bodyRef;
      const body =
        method === 'GET'
          ? 'never'
          : bodyRef
            ? bodyRef.isArray
              ? `Array<${bodyRef.name}>`
              : bodyRef.name
            : (c.contractSource.body ?? 'never');
      const response = buildResponseType(c, outDir);
      const params = buildParamsType(c.params);
      const safeMethod = JSON.stringify(method);
      const safeUrl = JSON.stringify(c.path);
      lines.push(
        `${pad}${objKey}: { method: ${safeMethod}; url: ${safeUrl}; params: ${params}; query: ${query}; body: ${body}; response: ${response} };`,
      );
    } else {
      lines.push(`${pad}${objKey}: {`);
      lines.push(...emitRouterTypeBlock(node.children, indent + 2, outDir));
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
        const withParams = hasPathParams(c.params);
        lines.push(`${pad}${objKey}: {`);
        if (withParams) {
          lines.push(
            `${pad}  queryKey: (params: ${typeAccess}['params'], query?: ${typeAccess}['query']) => query !== undefined ? [${flatName}, params, query] as const : [${flatName}, params] as const,`,
          );
          lines.push(
            `${pad}  queryOptions: (params: ${typeAccess}['params'], query?: ${typeAccess}['query']) =>`,
          );
          lines.push(`${pad}    _queryOptions({`);
          lines.push(
            `${pad}      queryKey: query !== undefined ? [${flatName}, params, query] as const : [${flatName}, params] as const,`,
          );
          lines.push(
            `${pad}      queryFn: () => fetcher.get<${typeAccess}['response']>(route(${flatName} as never, params as never) || ${safePath}, { query }),`,
          );
          lines.push(`${pad}    }),`);
          // infiniteQueryOptions for GET with params
          lines.push(
            `${pad}  infiniteQueryOptions: (params: ${typeAccess}['params'], query?: ${typeAccess}['query']) => ({`,
          );
          lines.push(
            `${pad}    queryKey: query !== undefined ? [${flatName}, params, query] as const : [${flatName}, params] as const,`,
          );
          lines.push(
            `${pad}    queryFn: ({ pageParam }: { pageParam: number }) => fetcher.get<${typeAccess}['response']>(route(${flatName} as never, params as never) || ${safePath}, { query: { ...(query != null ? query : {}), page: pageParam } as Record<string, unknown> }),`,
          );
          lines.push(`${pad}    initialPageParam: 1,`);
          lines.push(`${pad}    getNextPageParam: (lastPage: ${typeAccess}['response']) => {`);
          lines.push(`${pad}      const meta = (lastPage as any)?.meta;`);
          lines.push(`${pad}      if (meta?.page != null && meta?.lastPage != null) {`);
          lines.push(`${pad}        return meta.page < meta.lastPage ? meta.page + 1 : undefined;`);
          lines.push(`${pad}      }`);
          lines.push(`${pad}      return undefined;`);
          lines.push(`${pad}    },`);
          lines.push(`${pad}  }),`);
        } else {
          lines.push(
            `${pad}  queryKey: (query?: ${typeAccess}['query']) => query !== undefined ? [${flatName}, query] as const : [${flatName}] as const,`,
          );
          lines.push(`${pad}  queryOptions: (query?: ${typeAccess}['query']) =>`);
          lines.push(`${pad}    _queryOptions({`);
          lines.push(
            `${pad}      queryKey: query !== undefined ? [${flatName}, query] as const : [${flatName}] as const,`,
          );
          lines.push(
            `${pad}      queryFn: () => fetcher.get<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { query }),`,
          );
          lines.push(`${pad}    }),`);
          // infiniteQueryOptions for GET without params
          lines.push(`${pad}  infiniteQueryOptions: (query?: ${typeAccess}['query']) => ({`);
          lines.push(
            `${pad}    queryKey: query !== undefined ? [${flatName}, query] as const : [${flatName}] as const,`,
          );
          lines.push(
            `${pad}    queryFn: ({ pageParam }: { pageParam: number }) => fetcher.get<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { query: { ...(query != null ? query : {}), page: pageParam } as Record<string, unknown> }),`,
          );
          lines.push(`${pad}    initialPageParam: 1,`);
          lines.push(`${pad}    getNextPageParam: (lastPage: ${typeAccess}['response']) => {`);
          lines.push(`${pad}      const meta = (lastPage as any)?.meta;`);
          lines.push(`${pad}      if (meta?.page != null && meta?.lastPage != null) {`);
          lines.push(`${pad}        return meta.page < meta.lastPage ? meta.page + 1 : undefined;`);
          lines.push(`${pad}      }`);
          lines.push(`${pad}      return undefined;`);
          lines.push(`${pad}    },`);
          lines.push(`${pad}  }),`);
        }
        if (c.contractSource.filterFields?.length) {
          const fieldsUnion = c.contractSource.filterFields
            .map((f) => JSON.stringify(f))
            .join(' | ');
          lines.push(`${pad}  filterQuery: () => _filterQueryTyped<${fieldsUnion}>(),`);
        }
        lines.push(`${pad}},`);
      } else {
        const typeAccess = buildRouterTypeAccess(c.name);
        const withParams = hasPathParams(c.params);
        lines.push(`${pad}${objKey}: {`);
        lines.push(`${pad}  queryKey: () => [${flatName}] as const,`);
        lines.push(`${pad}  mutationOptions: () =>`);
        lines.push(`${pad}    _mutationOptions({`);
        if (withParams) {
          lines.push(
            `${pad}      mutationFn: (input: { params: ${typeAccess}['params']; body: ${typeAccess}['body'] }) => fetcher.${fetcherMethod}<${typeAccess}['response']>(route(${flatName} as never, input.params as never) || ${safePath}, { body: input.body }),`,
          );
        } else {
          lines.push(
            `${pad}      mutationFn: (body: ${typeAccess}['body']) => fetcher.${fetcherMethod}<${typeAccess}['response']>(route(${flatName} as never) || ${safePath}, { body }),`,
          );
        }
        lines.push(`${pad}    }),`);
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
    // When controllerRef exists, response uses ReturnType<import(...)> — skip response import
    const refs = r.controllerRef
      ? [cs.queryRef, cs.bodyRef]
      : [cs.queryRef, cs.bodyRef, cs.responseRef];
    for (const ref of refs) {
      if (!ref) continue;
      let names = importsByFile.get(ref.filePath);
      if (!names) {
        names = new Set();
        importsByFile.set(ref.filePath, names);
      }
      names.add(ref.name);
    }
  }

  const hasGetRoutes = contracted.some((r) => r.method === 'GET');
  const hasMutationRoutes = contracted.some((r) => r.method !== 'GET');
  const hasFilters = contracted.some((r) => r.contract?.contractSource.filterFields?.length);

  const lines: string[] = ['// Generated by @dudousxd/nestjs-inertia-codegen. Do not edit.', ''];

  // Import TanStack Query helpers (aliased to avoid name collision with generated api methods)
  const tqImports: string[] = [];
  if (hasGetRoutes) tqImports.push('queryOptions as _queryOptions');
  if (hasMutationRoutes) tqImports.push('mutationOptions as _mutationOptions');
  if (tqImports.length > 0) {
    lines.push(`import { ${tqImports.join(', ')} } from '@tanstack/react-query';`);
  }
  if (hasFilters) {
    lines.push(
      "import { filterQueryTyped as _filterQueryTyped } from '@dudousxd/nestjs-filter-client';",
    );
  }

  lines.push("import { router } from '@inertiajs/react';");
  lines.push(
    "import { route, ROUTES, type RouteName, type ExtractParams, type RouteParams } from './routes.js';",
  );
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
    lines.push('export type NavigateOptions = {');
    lines.push('  method?: string;');
    lines.push('  data?: Record<string, unknown>;');
    lines.push('  preserveState?: boolean;');
    lines.push('  preserveScroll?: boolean;');
    lines.push('  replace?: boolean;');
    lines.push('};');
    lines.push('');
    lines.push('export function navigate(_name: never, _options?: NavigateOptions): void {');
    lines.push('  // No routes available');
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
      params: r.params,
      controllerRef: r.controllerRef,
      contractSource: c.contractSource,
    };
    insertIntoTree(tree, segments, leaf, name);
  }

  // --- ApiRouter type ---
  lines.push('export type ApiRouter = {');
  lines.push(...emitRouterTypeBlock(tree, 2, outDir ?? ''));
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

  // --- NavigateOptions type ---
  lines.push('export type NavigateOptions = {');
  lines.push('  method?: string;');
  lines.push('  data?: Record<string, unknown>;');
  lines.push('  preserveState?: boolean;');
  lines.push('  preserveScroll?: boolean;');
  lines.push('  replace?: boolean;');
  lines.push('};');
  lines.push('');

  // --- navigate() function ---
  lines.push('/**');
  lines.push(' * Type-safe navigation using Inertia router.');
  lines.push(' * Resolves the URL from the named route and calls `router.visit()`.');
  lines.push(' */');
  lines.push('export function navigate<K extends RouteName>(');
  lines.push('  name: K,');
  lines.push('  ...args: ExtractParams<(typeof ROUTES)[K]> extends never');
  lines.push('    ? [options?: NavigateOptions]');
  lines.push('    : [options: { params: RouteParams<K> } & NavigateOptions]');
  lines.push('): void {');
  lines.push(
    '  const [options] = args as [({ params?: Record<string, string> } & NavigateOptions) | undefined];',
  );
  lines.push('  const url = route(name as never, (options as any)?.params as never);');
  lines.push('  const { params: _p, ...visitOptions } = options ?? {} as any;');
  lines.push('  router.visit(url, visitOptions);');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
