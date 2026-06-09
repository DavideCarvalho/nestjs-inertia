import { join, resolve } from 'node:path';
import fg from 'fast-glob';
/**
 * Static AST-based contract discovery using ts-morph.
 * Cold start ~100-500 ms.
 */
import {
  type ClassDeclaration,
  type InterfaceDeclaration,
  type MethodDeclaration,
  Node,
  Project,
  type SourceFile,
  SyntaxKind,
  type TypeNode,
} from 'ts-morph';
import { extractZodFromDto } from './dto-to-zod.js';
import { extractApplyFilterInfo } from './filter-for.js';
import {
  type TypeDeclResult,
  dbg,
  findType,
  loadTsconfigPaths,
  resolveImportedType,
  resolveTypeRef,
  restoreDiscoveryContext,
  setDiscoveryContext,
} from './type-ref-resolution.js';
import type { FilterFieldType, RouteDescriptor, TypeRef } from './types.js';

export interface FastDiscoveryOptions {
  /** Absolute path to the project root. */
  cwd: string;
  /** Controllers glob, e.g. 'src/**\/*.controller.ts' */
  glob: string;
  /** Optional tsconfig.json path; default 'tsconfig.json' in cwd */
  tsconfig?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function discoverContractsFast(
  opts: FastDiscoveryOptions,
): Promise<RouteDescriptor[]> {
  const { cwd, glob, tsconfig } = opts;

  const tsconfigPath = tsconfig ? resolve(tsconfig) : join(cwd, 'tsconfig.json');

  // Try to use tsconfig if it exists; fall back to bare compiler options
  let project: Project;
  try {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
    });
  } catch {
    // tsconfig not found — create a minimal project without it
    project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        resolveJsonModule: false,
        strict: false,
      },
    });
  }

  // Resolve controller file paths
  const files = await fg(glob, { cwd, absolute: true, onlyFiles: true });

  for (const f of files) {
    project.addSourceFileAtPath(f);
  }

  const routes: RouteDescriptor[] = [];

  // Save previous context and set current (prevents cross-call corruption)
  const prevCtx = setDiscoveryContext({
    projectRoot: cwd,
    tsconfigPaths: loadTsconfigPaths(tsconfigPath),
  });

  try {
    for (const sourceFile of project.getSourceFiles()) {
      routes.push(...extractFromSourceFile(sourceFile, project));
    }
  } finally {
    // Restore previous context so concurrent callers are not affected
    restoreDiscoveryContext(prevCtx);
  }

  return routes;
}

// ---------------------------------------------------------------------------
// AST walker — exported so unit tests can import it directly
// ---------------------------------------------------------------------------

/**
 * Convert a ts-morph Node (expression) representing a Zod schema call to a
 * TypeScript type-source string.  Falls back to `'unknown'` for anything
 * unrecognised.
 */
export function zodAstToTs(node: Node): string {
  // We only handle call expressions (e.g. z.string(), z.object({…}).optional())
  if (!Node.isCallExpression(node)) return 'unknown';

  const expr = node.getExpression();

  // ── Chained calls: z.xxx().optional() / .nullable() ──────────────────────
  if (Node.isPropertyAccessExpression(expr)) {
    const methodName = expr.getName();
    const receiver = expr.getExpression();

    if (methodName === 'optional') {
      return `${zodAstToTs(receiver)} | undefined`;
    }
    if (methodName === 'nullable') {
      return `${zodAstToTs(receiver)} | null`;
    }

    // ── z.<method>(…) top-level calls ────────────────────────────────────────
    const args = node.getArguments();

    switch (methodName) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'unknown':
        return 'unknown';
      case 'any':
        return 'unknown';

      case 'literal': {
        const lit = args[0];
        if (!lit) return 'unknown';
        if (Node.isStringLiteral(lit)) return JSON.stringify(lit.getLiteralValue());
        if (Node.isNumericLiteral(lit)) return lit.getLiteralValue().toString();
        if (lit.getKind() === SyntaxKind.TrueKeyword) return 'true';
        if (lit.getKind() === SyntaxKind.FalseKeyword) return 'false';
        return 'unknown';
      }

      case 'enum': {
        // z.enum(["a","b","c"])
        const arrArg = args[0];
        if (!arrArg || !Node.isArrayLiteralExpression(arrArg)) return 'unknown';
        const members = arrArg
          .getElements()
          .map((el) =>
            Node.isStringLiteral(el) ? JSON.stringify(el.getLiteralValue()) : 'unknown',
          );
        return members.join(' | ');
      }

      case 'array': {
        const inner = args[0];
        if (!inner) return 'unknown';
        return `Array<${zodAstToTs(inner)}>`;
      }

      case 'object': {
        const objArg = args[0];
        if (!objArg || !Node.isObjectLiteralExpression(objArg)) return 'unknown';
        const lines: string[] = [];
        for (const prop of objArg.getProperties()) {
          if (!Node.isPropertyAssignment(prop)) continue;
          const key = prop.getName();
          const valNode = prop.getInitializer();
          if (!valNode) continue;
          const tsType = zodAstToTs(valNode);
          // Mark optional if the value is .optional()
          const isOpt = isOptionalChain(valNode);
          lines.push(`${key}${isOpt ? '?' : ''}: ${tsType}`);
        }
        return `{ ${lines.join('; ')} }`;
      }

      case 'union': {
        const arrArg = args[0];
        if (!arrArg || !Node.isArrayLiteralExpression(arrArg)) return 'unknown';
        return arrArg.getElements().map(zodAstToTs).join(' | ');
      }

      case 'record': {
        // z.record(V) or z.record(K, V) — always emit Record<string, V>
        const valArg = args.length === 1 ? args[0] : args[1];
        if (!valArg) return 'unknown';
        return `Record<string, ${zodAstToTs(valArg)}>`;
      }

      case 'tuple': {
        const arrArg = args[0];
        if (!arrArg || !Node.isArrayLiteralExpression(arrArg)) return 'unknown';
        return `[${arrArg.getElements().map(zodAstToTs).join(', ')}]`;
      }

      default:
        return 'unknown';
    }
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return true when `node` is a CallExpression ending in `.optional()`. */
function isOptionalChain(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;
  const expr = node.getExpression();
  return Node.isPropertyAccessExpression(expr) && expr.getName() === 'optional';
}

/** Extract the string value from a decorator argument that is a string literal. */
function decoratorStringArg(decoratorExpr: Node | undefined): string | undefined {
  if (!decoratorExpr) return undefined;
  if (Node.isStringLiteral(decoratorExpr)) return decoratorExpr.getLiteralValue();
  if (Node.isArrayLiteralExpression(decoratorExpr)) {
    const first = decoratorExpr.getElements()[0];
    if (first && Node.isStringLiteral(first)) return first.getLiteralValue();
  }
  return undefined;
}

/**
 * Parse a defineContract({...}) call expression.
 * Returns { query, body, response } or null if unrecognised.
 */
interface ParsedContractDef {
  query: string | null;
  body: string | null;
  response: string;
  /** Raw zod source text of the body initializer (for inline forms emit). */
  bodyZodText: string | null;
  /** Raw zod source text of the query initializer (for inline forms emit). */
  queryZodText: string | null;
}

function parseDefineContractCall(callExpr: Node): ParsedContractDef | null {
  if (!Node.isCallExpression(callExpr)) return null;

  const callee = callExpr.getExpression();
  // Accept both `defineContract(...)` and any identifier named defineContract
  const calleeName = Node.isIdentifier(callee)
    ? callee.getText()
    : Node.isPropertyAccessExpression(callee)
      ? callee.getName()
      : '';

  if (calleeName !== 'defineContract') return null;

  const args = callExpr.getArguments();
  const optsArg = args[0];
  if (!optsArg || !Node.isObjectLiteralExpression(optsArg)) return null;

  let query: string | null = null;
  let body: string | null = null;
  let response = 'unknown';
  let bodyZodText: string | null = null;
  let queryZodText: string | null = null;

  for (const prop of optsArg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const propName = prop.getName();
    const val = prop.getInitializer();
    if (!val) continue;

    if (propName === 'query') {
      query = zodAstToTs(val);
      queryZodText = val.getText();
    } else if (propName === 'body') {
      body = zodAstToTs(val);
      bodyZodText = val.getText();
    } else if (propName === 'response') {
      response = zodAstToTs(val);
    }
  }

  return { query, body, response, bodyZodText, queryZodText };
}

/**
 * Derive the route name from a controller class name and method name.
 * Strips the `Controller` suffix from the class name and lowercases the first letter.
 * e.g. `UsersController.list` → `users.list`
 */
export function deriveRouteName(className: string, methodName: string): string {
  const noSuffix = className.replace(/Controller$/, '');
  if (!noSuffix) {
    throw new Error(
      `Controller class name "${className}" derives empty route segment after stripping "Controller". Add an @As(...) override.`,
    );
  }
  const segment = noSuffix.charAt(0).toLowerCase() + noSuffix.slice(1);
  return `${segment}.${methodName}`;
}

/**
 * Derive just the class segment (no method) from a controller class name.
 * Strips the `Controller` suffix and lowercases the first letter.
 */
export function deriveClassSegment(className: string): string {
  const noSuffix = className.replace(/Controller$/, '');
  if (!noSuffix) {
    throw new Error(
      `Controller class name "${className}" derives empty route segment after stripping "Controller". Add an @As(...) override at the class level.`,
    );
  }
  return noSuffix.charAt(0).toLowerCase() + noSuffix.slice(1);
}

/**
 * Compose the final route name from class-level and method-level @As decorators.
 * Rule:
 *   classPortion  = class @As value  ?? deriveClassSegment(className)
 *   methodPortion = method @As value ?? methodName
 *   result        = `${classPortion}.${methodPortion}`
 */
export function resolveRouteName(
  className: string,
  methodName: string,
  classAs: string | undefined,
  methodAs: string | undefined,
): string {
  const classPortion = classAs ?? deriveClassSegment(className);
  const methodPortion = methodAs ?? methodName;
  return `${classPortion}.${methodPortion}`;
}

/** Join two URL path segments, normalising duplicate slashes. */
export function joinPaths(prefix: string, suffix: string): string {
  if (!prefix && !suffix) return '/';
  if (!prefix) return suffix.startsWith('/') ? suffix : `/${suffix}`;
  if (!suffix) return prefix.startsWith('/') ? prefix : `/${prefix}`;

  const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const combined = p + s;
  return combined === '' ? '/' : combined;
}

/** Extract path params from a URL pattern string, e.g. `/users/:id` → [{name:'id',source:'path'}] */
function extractParams(
  path: string,
): Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }> {
  const matches = path.matchAll(/:(\w+)/g);
  return Array.from(matches).map((m) => ({ name: m[1] as string, source: 'path' as const }));
}

// ---------------------------------------------------------------------------
// DTO-based contract extraction (standard NestJS patterns — no defineContract)
// ---------------------------------------------------------------------------

/**
 * Resolve a TypeNode to a TypeScript type-source string.
 * Follows imports across files via the ts-morph Project.
 * `depth` limits recursive expansion (guards against circular references).
 */
function resolveTypeNodeToString(
  typeNode: TypeNode,
  sourceFile: SourceFile,
  project: Project,
  depth: number,
): string {
  if (depth <= 0) return 'unknown';

  // Array<T> or T[] — unwrap and wrap
  if (Node.isArrayTypeNode(typeNode)) {
    const elementType = typeNode.getElementTypeNode();
    return `Array<${resolveTypeNodeToString(elementType, sourceFile, project, depth)}>`;
  }

  // Union: A | B | C — resolve each member so named refs get inlined
  if (Node.isUnionTypeNode(typeNode)) {
    return typeNode
      .getTypeNodes()
      .map((t) => resolveTypeNodeToString(t, sourceFile, project, depth))
      .join(' | ');
  }

  // Intersection: A & B — same treatment
  if (Node.isIntersectionTypeNode(typeNode)) {
    return typeNode
      .getTypeNodes()
      .map((t) => resolveTypeNodeToString(t, sourceFile, project, depth))
      .join(' & ');
  }

  // Parenthesized: ( ... ) — unwrap
  if (Node.isParenthesizedTypeNode(typeNode)) {
    return `(${resolveTypeNodeToString(typeNode.getTypeNode(), sourceFile, project, depth)})`;
  }

  // TypeReference: Foo, Foo[], Array<Foo>, Promise<Foo>, etc.
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const name = Node.isIdentifier(typeName) ? typeName.getText() : typeNode.getText();

    // Well-known pass-through primitives and types
    if (name === 'string' || name === 'number' || name === 'boolean') return name;
    if (name === 'Date') return 'string';
    if (name === 'unknown' || name === 'any' || name === 'void') return 'unknown';
    // Server-only types that don't make sense on the client
    if (name === 'StreamableFile' || name === 'Observable' || name === 'ReadableStream')
      return 'unknown';

    // MikroORM Ref/Reference/LoadedReference are server-side wrappers around
    // related entities. The wire shape is just the referenced entity (or a
    // shallow `{ id }` projection when not populated). Unwrap to the type
    // argument so client code sees the plain entity shape.
    if (
      name === 'Ref' ||
      name === 'Reference' ||
      name === 'LoadedReference' ||
      name === 'IdentifiedReference'
    ) {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth);
      }
      return 'unknown';
    }
    // MikroORM Collection<T> serializes as an array of T on the wire.
    if (name === 'Collection') {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return `Array<${resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth)}>`;
      }
      return 'Array<unknown>';
    }
    // MikroORM Opt<T> / Loaded<T, ...> — Opt is a marker, Loaded is a wrapper.
    // Both reduce to T at the JSON wire level.
    if (name === 'Opt' || name === 'Loaded') {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth);
      }
      return 'unknown';
    }

    // Array<T> generic form
    if (name === 'Array') {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return `Array<${resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth)}>`;
      }
      return 'Array<unknown>';
    }

    // Well-known utility types — preserve full text with type args
    if (
      ['Record', 'Omit', 'Pick', 'Partial', 'Required', 'Readonly', 'Map', 'Set'].includes(name)
    ) {
      return typeNode.getText();
    }

    // Promise<T> — unwrap
    if (name === 'Promise') {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth);
      }
      return 'unknown';
    }

    // Try same file first, then follow imports (class, interface, type alias, enum)
    const resolved = findType(name, sourceFile, project);
    if (resolved) {
      return expandTypeDecl(resolved, project, depth - 1);
    }

    // Unresolvable type — use unknown instead of bare name to avoid TS errors in generated code
    dbg('unresolvable type:', name, 'in', sourceFile.getFilePath());
    return 'unknown';
  }

  // Primitive keyword types
  const kind = typeNode.getKind();
  if (kind === SyntaxKind.StringKeyword) return 'string';
  if (kind === SyntaxKind.NumberKeyword) return 'number';
  if (kind === SyntaxKind.BooleanKeyword) return 'boolean';
  if (kind === SyntaxKind.UnknownKeyword) return 'unknown';
  if (kind === SyntaxKind.AnyKeyword) return 'unknown';

  // Fallback: raw text
  return typeNode.getText();
}

/**
 * Expand a TypeDeclResult into an inline TS type string.
 */
function expandTypeDecl(result: TypeDeclResult, project: Project, depth: number): string {
  if (depth < 0) return 'unknown';
  switch (result.kind) {
    case 'class':
      return resolvePropertied(result.decl, result.file, project, depth);
    case 'interface':
      return resolvePropertied(result.decl, result.file, project, depth);
    case 'typeAlias':
      // Recursively resolve the alias body so that any named types it
      // references (e.g. `A | B | C`) are expanded inline rather than left
      // as bare identifiers, which would be undefined in the emitted code.
      if (result.typeNode) {
        return resolveTypeNodeToString(result.typeNode, result.file, project, depth);
      }
      return result.text;
    case 'enum':
      return result.members.join(' | ');
  }
}

/**
 * Turn a class or interface declaration's properties into a TS object type string like
 * `{ id: string; title: string; page?: number }`.
 */
function resolvePropertied(
  decl: ClassDeclaration | InterfaceDeclaration,
  sourceFile: SourceFile,
  project: Project,
  depth: number,
): string {
  if (depth < 0) return 'unknown';

  const lines: string[] = [];
  for (const prop of decl.getProperties()) {
    const propName = prop.getName();
    const isOptional = prop.hasQuestionToken();
    const propTypeNode = prop.getTypeNode();
    let propType = 'unknown';
    if (propTypeNode) {
      propType = resolveTypeNodeToString(propTypeNode, sourceFile, project, depth);
    }
    lines.push(`${propName}${isOptional ? '?' : ''}: ${propType}`);
  }
  return `{ ${lines.join('; ')} }`;
}

/**
 * Extract the body type from a `@Body()` (no-arg) decorated parameter.
 * Returns a TS type string or null.
 */
function extractBodyType(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): string | null {
  for (const param of method.getParameters()) {
    const bodyDecorator = param.getDecorators().find((d) => d.getName() === 'Body');
    if (!bodyDecorator) continue;
    const bodyArgs = bodyDecorator.getArguments();
    if (bodyArgs.length > 0) continue;
    const typeNode = param.getTypeNode();
    if (typeNode) {
      return resolveTypeNodeToString(typeNode, sourceFile, project, 3);
    }
  }
  return null;
}

/**
 * Extract the query type from a `@Query()` (no-arg) decorated parameter.
 * Returns a TS type string or null.
 */
function extractQueryType(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): string | null {
  for (const param of method.getParameters()) {
    const queryDecorator = param.getDecorators().find((d) => d.getName() === 'Query');
    if (!queryDecorator) continue;
    const queryArgs = queryDecorator.getArguments();
    if (queryArgs.length > 0) continue;
    const typeNode = param.getTypeNode();
    if (typeNode) {
      return resolveTypeNodeToString(typeNode, sourceFile, project, 3);
    }
  }
  return null;
}

/**
 * Collect `@Param('name')` decorated parameters into a `{ name: type; ... }` string.
 * Returns a TS type string or null when no @Param decorators are present.
 */
function extractParamsType(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): string | null {
  const entries: string[] = [];
  for (const param of method.getParameters()) {
    const paramDecorator = param.getDecorators().find((d) => d.getName() === 'Param');
    if (!paramDecorator) continue;
    const paramArgs = paramDecorator.getArguments();
    if (paramArgs.length === 0) continue;
    const nameArg = paramArgs[0];
    if (!Node.isStringLiteral(nameArg)) continue;
    const paramName = nameArg.getLiteralValue();
    const typeNode = param.getTypeNode();
    const paramType = typeNode
      ? resolveTypeNodeToString(typeNode, sourceFile, project, 3)
      : 'string';
    entries.push(`${paramName}: ${paramType}`);
  }
  return entries.length > 0 ? `{ ${entries.join('; ')} }` : null;
}

/**
 * Extract the response type from `@ApiResponse({ type: X })` or `@ApiResponse({ type: [X] })`.
 * Falls back to the method return type annotation (unwrapping `Promise<>`).
 * Returns a TS type string (never null — falls back to 'unknown').
 */
function extractResponseType(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): string {
  // 1. Try @ApiResponse
  const apiResponseDecorator = method.getDecorator('ApiResponse');
  if (apiResponseDecorator) {
    const args = apiResponseDecorator.getArguments();
    const optsArg = args[0];
    if (optsArg && Node.isObjectLiteralExpression(optsArg)) {
      for (const prop of optsArg.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;
        if (prop.getName() !== 'type') continue;
        const val = prop.getInitializer();
        if (!val) continue;

        // type: [PostDto] — array syntax
        if (Node.isArrayLiteralExpression(val)) {
          const elements = val.getElements();
          const firstEl = elements[0];
          if (elements.length > 0 && firstEl !== undefined) {
            const innerType = resolveIdentifierToClassType(firstEl, sourceFile, project, 3);
            return `Array<${innerType}>`;
          }
          return 'Array<unknown>';
        }

        // type: PostDto — single class reference
        return resolveIdentifierToClassType(val, sourceFile, project, 3);
      }
    }
  }

  // 2. Fall back to return type annotation
  const returnTypeNode = method.getReturnTypeNode();
  if (returnTypeNode) {
    return resolveTypeNodeToString(returnTypeNode, sourceFile, project, 3);
  }

  return 'unknown';
}

/**
 * Resolve an expression (expected to be a class identifier) to its expanded type string.
 * E.g. the `PostDto` identifier in `@ApiResponse({ type: PostDto })`.
 */
function resolveIdentifierToClassType(
  node: Node,
  sourceFile: SourceFile,
  project: Project,
  depth: number,
): string {
  if (!Node.isIdentifier(node)) return 'unknown';
  const name = node.getText();
  const resolved = findType(name, sourceFile, project);
  if (resolved) {
    return expandTypeDecl(resolved, project, depth - 1);
  }
  return name;
}

/**
 * Resolve a `@Body()` / `@Query()` param or return-type `TypeNode` to a named
 * exported class/interface ref (unwrapping `Promise<T>` / `Array<T>` / `T[]`).
 * Thin wrapper over the shared {@link resolveTypeRef}.
 */
function resolveBodyQueryResponseRef(
  typeNode: TypeNode,
  sourceFile: SourceFile,
  project: Project,
): TypeRef | null {
  return resolveTypeRef(typeNode, sourceFile, project, {
    kinds: ['class', 'interface'],
    unwrapContainers: true,
  });
}

/**
 * Determine whether a method has any DTO-based contract info worth emitting
 * (body, query, params, or non-unknown response).
 * Returns a ContractSource-shaped object or null.
 */
export function extractDtoContract(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): {
  query: string | null;
  body: string | null;
  response: string;
  params: string | null;
  queryRef?: TypeRef | null;
  bodyRef?: TypeRef | null;
  responseRef?: TypeRef | null;
  filterFields?: string[] | null;
  filterFieldTypes?: FilterFieldType[] | null;
  filterSource?: 'body' | 'query' | null;
  bodyZodText?: string | null;
  queryZodText?: string | null;
  formNestedSchemas?: Record<string, string> | null;
  formWarnings?: string[];
} | null {
  let body = extractBodyType(method, sourceFile, project);
  const filterInfo = extractApplyFilterInfo(method, sourceFile, project);
  const query = extractQueryType(method, sourceFile, project);

  // Place filter type on the correct field based on @ApplyFilter source. The
  // body-source case still pre-renders a fixed `FilterQueryResult` here; the
  // query-source TypedFilterQuery TYPE is rendered in emit-api.ts (from
  // filterFields + filterFieldTypes) so it is byte-identical to the
  // `_filterQueryTyped<...>` factory args.
  if (filterInfo && filterInfo.source === 'body') {
    const bodyType = "import('@dudousxd/nestjs-filter-client').FilterQueryResult";
    body = body ?? bodyType;
  }

  const paramsType = extractParamsType(method, sourceFile, project);
  const response = extractResponseType(method, sourceFile, project);

  // Only emit a contract if there is at least something useful. A query-source
  // `@ApplyFilter` route carries no pre-rendered `query` string anymore (the
  // TypedFilterQuery type is rendered in emit-api), so it must be kept alive via
  // `filterInfo` even when every other field is empty.
  if (
    body === null &&
    query === null &&
    paramsType === null &&
    response === 'unknown' &&
    filterInfo === null
  ) {
    return null;
  }

  // Capture type references for import generation
  let bodyRef: TypeRef | null = null;
  let queryRef: TypeRef | null = null;
  let responseRef: TypeRef | null = null;

  for (const param of method.getParameters()) {
    if (param.getDecorators().some((d) => d.getName() === 'Body') && param.getTypeNode()) {
      bodyRef = resolveBodyQueryResponseRef(param.getTypeNode()!, sourceFile, project);
    }
    if (param.getDecorators().some((d) => d.getName() === 'Query') && param.getTypeNode()) {
      queryRef = resolveBodyQueryResponseRef(param.getTypeNode()!, sourceFile, project);
    }
  }

  const returnTypeNode = method.getReturnTypeNode();
  if (returnTypeNode) {
    responseRef = resolveBodyQueryResponseRef(returnTypeNode, sourceFile, project);
  }
  // Also check @ApiResponse
  if (!responseRef) {
    const apiResp = method.getDecorator('ApiResponse');
    if (apiResp) {
      const args = apiResp.getArguments();
      const optsArg = args[0];
      if (optsArg && Node.isObjectLiteralExpression(optsArg)) {
        for (const prop of optsArg.getProperties()) {
          if (Node.isPropertyAssignment(prop) && prop.getName() === 'type') {
            const val = prop.getInitializer();
            if (val && Node.isIdentifier(val)) {
              const name = val.getText();
              const localDecl =
                sourceFile.getInterface(name) ||
                sourceFile.getClass(name) ||
                sourceFile.getTypeAlias(name);
              if (localDecl?.isExported()) {
                responseRef = { name, filePath: sourceFile.getFilePath() };
              } else {
                const resolved = resolveImportedType(name, sourceFile, project);
                if (
                  resolved &&
                  (resolved.kind === 'class' || resolved.kind === 'interface') &&
                  resolved.decl.isExported()
                ) {
                  responseRef = { name, filePath: resolved.file.getFilePath() };
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Synthesize form zod schemas from class-validator DTOs (Path B) ────────
  // Resolve the @Body()/@Query() param to a class declaration and translate its
  // decorators. A defineContract schema always wins, so this only runs on the
  // plain-verb path where no contract schema is present.
  let bodyZodText: string | null = null;
  let queryZodText: string | null = null;
  const formNested: Record<string, string> = {};
  const formWarnings: string[] = [];

  const bodyClass = resolveParamClass(method, 'Body', sourceFile, project);
  if (bodyClass) {
    const result = extractZodFromDto(bodyClass.decl, bodyClass.file, project);
    bodyZodText = result.schemaText;
    for (const [k, v] of result.namedNestedSchemas) formNested[k] = v;
    formWarnings.push(...result.warnings);
  }
  const queryClass = resolveParamClass(method, 'Query', sourceFile, project);
  if (queryClass) {
    const result = extractZodFromDto(queryClass.decl, queryClass.file, project);
    queryZodText = result.schemaText;
    for (const [k, v] of result.namedNestedSchemas) formNested[k] = v;
    formWarnings.push(...result.warnings);
  }

  return {
    query,
    body,
    response,
    params: paramsType,
    queryRef,
    bodyRef,
    responseRef,
    filterFields: filterInfo?.fieldNames ?? null,
    filterFieldTypes: filterInfo?.fieldTypes ?? null,
    filterSource: filterInfo?.source ?? null,
    bodyZodText,
    queryZodText,
    formNestedSchemas: Object.keys(formNested).length > 0 ? formNested : null,
    formWarnings,
  };
}

/**
 * Resolve a `@Body()` / `@Query()` parameter's TS type to a class declaration
 * (following imports). Returns null for interfaces / plain types / unresolved.
 */
function resolveParamClass(
  method: MethodDeclaration,
  decoratorName: 'Body' | 'Query',
  sourceFile: SourceFile,
  project: Project,
): { decl: ClassDeclaration; file: SourceFile } | null {
  for (const param of method.getParameters()) {
    if (!param.getDecorators().some((d) => d.getName() === decoratorName)) continue;
    const typeNode = param.getTypeNode();
    if (!typeNode) continue;
    // Strip array suffix — translate the element class.
    const text = typeNode.getText().replace(/\[\]$/, '');
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)) continue;
    const resolved = findType(text, sourceFile, project);
    if (resolved && resolved.kind === 'class') {
      return { decl: resolved.decl, file: resolved.file };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP method decorator names recognised by the fast path
// ---------------------------------------------------------------------------

const HTTP_METHOD_DECORATORS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL',
};

// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------

function extractFromSourceFile(sourceFile: SourceFile, project: Project): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];
  // Track derived/assigned names to detect collisions: name → fully-qualified method ref
  const seenNames = new Map<string, string>();

  const classes = sourceFile.getClasses();

  for (const cls of classes) {
    // Find @Controller(...) decorator
    const controllerDecorator = cls.getDecorator('Controller');
    if (!controllerDecorator) continue;

    // Determine controller path prefix
    const controllerArgs = controllerDecorator.getArguments();
    const firstArg = controllerArgs[0];
    const prefix = decoratorStringArg(firstArg) ?? '';

    const className = cls.getName() ?? 'Unknown';

    // Walk all methods
    for (const method of cls.getMethods()) {
      // ── Determine HTTP method + sub-path from NestJS verb decorators ──────
      let httpMethod: string | undefined;
      let handlerPath = '';

      for (const [decoratorName, verb] of Object.entries(HTTP_METHOD_DECORATORS)) {
        const httpDecorator = method.getDecorator(decoratorName);
        if (httpDecorator) {
          httpMethod = verb;
          const httpArgs = httpDecorator.getArguments();
          const pathArg = httpArgs[0];
          handlerPath = decoratorStringArg(pathArg) ?? '';
          break;
        }
      }

      // ── Check for @ApplyContract ──────────────────────────────────────────
      const applyContractDecorator = method.getDecorator('ApplyContract');

      if (applyContractDecorator) {
        const decoratorArgs = applyContractDecorator.getArguments();
        const firstDecoratorArg = decoratorArgs[0];
        if (!firstDecoratorArg) continue;

        // Resolve contract definition from inline call or identifier
        let contractDef: ParsedContractDef | null = null;
        // When the contract is a named const we can import, re-export its
        // members (`<const>.body` / `<const>.query`) for perfect parity.
        let bodyZodRef: TypeRef | null = null;
        let queryZodRef: TypeRef | null = null;

        if (Node.isCallExpression(firstDecoratorArg)) {
          contractDef = parseDefineContractCall(firstDecoratorArg);
        } else if (Node.isIdentifier(firstDecoratorArg)) {
          const identName = firstDecoratorArg.getText();
          const varDecl = sourceFile.getVariableDeclaration(identName);
          if (!varDecl) {
            console.warn(
              `[nestjs-inertia-codegen/fast] Cannot resolve '${identName}' in ${sourceFile.getFilePath()} (cross-file imports are out-of-scope for v1) — skipping`,
            );
            continue;
          }

          const initializer = varDecl.getInitializer();
          if (!initializer) continue;

          contractDef = parseDefineContractCall(initializer);
          // Re-export the named contract's schema members (Path A). Only when the
          // const is exported so forms.ts can import it.
          if (contractDef && varDecl.isExported()) {
            const filePath = sourceFile.getFilePath();
            if (contractDef.body !== null) {
              bodyZodRef = { name: `${identName}.body`, filePath };
            }
            if (contractDef.query !== null) {
              queryZodRef = { name: `${identName}.query`, filePath };
            }
          }
        } else {
          console.warn(
            `[nestjs-inertia-codegen/fast] @ApplyContract arg is not an identifier or call expression in ${sourceFile.getFilePath()} — skipping`,
          );
          continue;
        }

        if (!contractDef) continue;

        // Method + path always come from NestJS decorators — skip if absent
        if (!httpMethod) continue;
        const resolvedMethod = httpMethod;
        const resolvedPath = joinPaths(prefix, handlerPath);

        const combined = resolvedPath;
        const params = extractParams(combined);

        // Determine route name: compose class-level @As + method-level @As
        const methodName = method.getName();

        // Read class-level @As
        const classAsDecorator = cls.getDecorator('As');
        let classAs: string | undefined;
        if (classAsDecorator) {
          const classAsArgs = classAsDecorator.getArguments();
          const classAsName = decoratorStringArg(classAsArgs[0]);
          if (!classAsName) {
            throw new Error(
              `@As decorator on class ${className} must have a non-empty string argument.`,
            );
          }
          classAs = classAsName;
        }

        // Read method-level @As
        const methodAsDecorator = method.getDecorator('As');
        let methodAs: string | undefined;
        if (methodAsDecorator) {
          const methodAsArgs = methodAsDecorator.getArguments();
          const methodAsName = decoratorStringArg(methodAsArgs[0]);
          if (!methodAsName) {
            throw new Error(
              `@As decorator on ${className}.${methodName} must have a non-empty string argument.`,
            );
          }
          methodAs = methodAsName;
        }

        const routeName = resolveRouteName(className, methodName, classAs, methodAs);

        // Collision detection across contracted routes
        const qualifiedRef = `${className}.${methodName}`;
        const existing = seenNames.get(routeName);
        if (existing !== undefined) {
          throw new Error(
            `Route name collision: "${routeName}" is used by both "${existing}" and "${qualifiedRef}". Use @As(...) to give one of them a unique name.`,
          );
        }
        seenNames.set(routeName, qualifiedRef);

        routes.push({
          method: resolvedMethod,
          path: combined,
          name: routeName,
          params,
          controllerRef: { className, methodName, filePath: sourceFile.getFilePath() },
          contract: {
            contractSource: {
              query: contractDef.query,
              body: contractDef.body,
              response: contractDef.response,
              // Path A: capture both the importable ref and the raw text. The
              // emitter prefers inlining the text (client-safe — re-exporting from
              // a controller would drag server-only deps into the client bundle).
              bodyZodRef,
              bodyZodText: contractDef.bodyZodText,
              queryZodRef,
              queryZodText: contractDef.queryZodText,
            },
          },
        });
      } else {
        // ── Plain HTTP verb decorator (no @ApplyContract) ──────────────────
        if (!httpMethod) continue;

        const combined = joinPaths(prefix, handlerPath);
        const params = extractParams(combined);

        const methodName = method.getName();

        // Read class-level @As
        const classAsDecorator = cls.getDecorator('As');
        let classAs: string | undefined;
        if (classAsDecorator) {
          const classAsArgs = classAsDecorator.getArguments();
          const classAsName = decoratorStringArg(classAsArgs[0]);
          if (classAsName) classAs = classAsName;
        }

        // Read method-level @As
        const methodAsDecorator = method.getDecorator('As');
        let methodAs: string | undefined;
        if (methodAsDecorator) {
          const methodAsArgs = methodAsDecorator.getArguments();
          const methodAsName = decoratorStringArg(methodAsArgs[0]);
          if (methodAsName) methodAs = methodAsName;
        }

        const routeName = resolveRouteName(className, methodName, classAs, methodAs);

        // ── DTO-based contract extraction ──────────────────────────────────
        const dtoContract = extractDtoContract(method, sourceFile, project);

        routes.push({
          method: httpMethod,
          path: combined,
          name: routeName,
          params,
          controllerRef: { className, methodName, filePath: sourceFile.getFilePath() },
          contract: {
            contractSource: {
              query: dtoContract?.query ?? null,
              body: dtoContract?.body ?? null,
              response: dtoContract?.response ?? 'unknown',
              queryRef: dtoContract?.queryRef ?? null,
              bodyRef: dtoContract?.bodyRef ?? null,
              responseRef: dtoContract?.responseRef ?? null,
              filterFields: dtoContract?.filterFields ?? null,
              filterFieldTypes: dtoContract?.filterFieldTypes ?? null,
              filterSource: dtoContract?.filterSource ?? null,
              bodyZodText: dtoContract?.bodyZodText ?? null,
              queryZodText: dtoContract?.queryZodText ?? null,
              formNestedSchemas: dtoContract?.formNestedSchemas ?? null,
              formWarnings: dtoContract?.formWarnings ?? [],
            },
          },
        });
      }
    }
  }

  return routes;
}
