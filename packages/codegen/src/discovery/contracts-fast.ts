import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
  type TypeNode,
} from 'ts-morph';
import type { RouteDescriptor, TypeRef } from './types.js';

export interface FastDiscoveryOptions {
  /** Absolute path to the project root. */
  cwd: string;
  /** Controllers glob, e.g. 'src/**\/*.controller.ts' */
  glob: string;
  /** Optional tsconfig.json path; default 'tsconfig.json' in cwd */
  tsconfig?: string;
}

/**
 * Discovery context — scoped per `discoverContractsFast` invocation.
 * Saved/restored around each call to prevent cross-call corruption
 * when concurrent invocations occur (e.g. in tests or overlapping watcher triggers).
 */
export interface DiscoveryContext {
  projectRoot: string;
  tsconfigPaths: Record<string, string[]> | null;
}

let _ctx: DiscoveryContext = { projectRoot: '', tsconfigPaths: null };

// Backwards-compatible accessors for internal functions
function _projectRoot(): string {
  return _ctx.projectRoot;
}
function _tsconfigPaths(): Record<string, string[]> | null {
  return _ctx.tsconfigPaths;
}
const _debug = process.env.NESTJS_INERTIA_DEBUG === '1';
function dbg(...args: unknown[]) {
  if (_debug) console.log('[codegen:debug]', ...args);
}

function loadTsconfigPaths(tsconfigPath: string): Record<string, string[]> | null {
  try {
    const raw = readFileSync(tsconfigPath, 'utf8');
    // Strip single-line comments (tsconfig allows them)
    const stripped = raw.replace(/\/\/.*$/gm, '');
    const parsed = JSON.parse(stripped) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    return parsed.compilerOptions?.paths ?? null;
  } catch {
    return null;
  }
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
  const prevCtx = _ctx;
  _ctx = { projectRoot: cwd, tsconfigPaths: loadTsconfigPaths(tsconfigPath) };

  try {
    for (const sourceFile of project.getSourceFiles()) {
      routes.push(...extractFromSourceFile(sourceFile, project));
    }
  } finally {
    // Restore previous context so concurrent callers are not affected
    _ctx = prevCtx;
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
function parseDefineContractCall(callExpr: Node): {
  query: string | null;
  body: string | null;
  response: string;
} | null {
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

  for (const prop of optsArg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const propName = prop.getName();
    const val = prop.getInitializer();
    if (!val) continue;

    if (propName === 'query') {
      query = zodAstToTs(val);
    } else if (propName === 'body') {
      body = zodAstToTs(val);
    } else if (propName === 'response') {
      response = zodAstToTs(val);
    }
  }

  return { query, body, response };
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

type TypeDeclResult =
  | { kind: 'class'; decl: ClassDeclaration; file: SourceFile }
  | { kind: 'interface'; decl: InterfaceDeclaration; file: SourceFile }
  | { kind: 'typeAlias'; typeNode: TypeNode | undefined; file: SourceFile; text: string }
  | { kind: 'enum'; members: string[] };

/**
 * Try to find a type declaration (class, interface, type alias, enum) in a source file.
 */
function findTypeInFile(name: string, file: SourceFile): TypeDeclResult | null {
  const cls = file.getClass(name);
  if (cls) return { kind: 'class', decl: cls, file };

  const iface = file.getInterface(name);
  if (iface) return { kind: 'interface', decl: iface, file };

  const alias = file.getTypeAlias(name);
  if (alias) {
    const typeNode = alias.getTypeNode();
    return {
      kind: 'typeAlias',
      typeNode,
      file,
      text: typeNode ? typeNode.getText() : 'unknown',
    };
  }

  const enumDecl = file.getEnum(name);
  if (enumDecl) {
    const members = enumDecl.getMembers().map((m) => {
      const val = m.getValue();
      return typeof val === 'string' ? JSON.stringify(val) : JSON.stringify(m.getName());
    });
    return { kind: 'enum', members };
  }

  return null;
}

/**
 * Follow import declarations to find a type in another file.
 */
function resolveModuleSpecifier(
  moduleSpecifier: string,
  sourceFile: SourceFile,
  project: Project,
): string[] {
  if (moduleSpecifier.startsWith('.')) {
    const dir = dirname(sourceFile.getFilePath());
    return [resolve(dir, `${moduleSpecifier}.ts`), resolve(dir, moduleSpecifier, 'index.ts')];
  }

  // Try to resolve path aliases via tsconfig paths (read directly from JSON)
  const baseUrl = _projectRoot();
  const tsconfigPaths = _tsconfigPaths();

  dbg(
    'resolveModuleSpecifier',
    moduleSpecifier,
    'paths:',
    JSON.stringify(tsconfigPaths),
    'baseUrl:',
    baseUrl,
  );

  if (tsconfigPaths) {
    for (const [pattern, mappings] of Object.entries(tsconfigPaths)) {
      const prefix = pattern.replace('*', '');
      if (moduleSpecifier.startsWith(prefix)) {
        const rest = moduleSpecifier.slice(prefix.length);
        const candidates: string[] = [];
        for (const mapping of mappings) {
          const resolved = resolve(baseUrl, mapping.replace('*', rest));
          candidates.push(`${resolved}.ts`, resolve(resolved, 'index.ts'));
        }
        dbg('  resolved candidates:', candidates);
        return candidates;
      }
    }
  }

  return [];
}

function resolveImportedType(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): TypeDeclResult | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImport = importDecl.getNamedImports().find((n) => n.getName() === name);
    if (!namedImport) continue;

    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const candidates = resolveModuleSpecifier(moduleSpecifier, sourceFile, project);
    if (candidates.length === 0) continue;

    for (const candidate of candidates) {
      let importedFile = project.getSourceFile(candidate);
      if (!importedFile) {
        try {
          importedFile = project.addSourceFileAtPath(candidate);
        } catch {
          continue;
        }
      }
      const result = findTypeInFile(name, importedFile);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Find a type declaration by name: first in the current file, then by following imports.
 */
function findType(name: string, sourceFile: SourceFile, project: Project): TypeDeclResult | null {
  const local = findTypeInFile(name, sourceFile);
  if (local) return local;
  return resolveImportedType(name, sourceFile, project);
}

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
 * Extract the query type from an `@ApplyFilter(FilterClass)` decorated parameter.
 * Resolves the filter class and reads its properties (excluding inherited base class members).
 * Returns a TS type string or null.
 */
function extractApplyFilterInfo(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): { queryType: string; fieldNames: string[]; source: 'body' | 'query' } | null {
  for (const param of method.getParameters()) {
    const filterDecorator = param.getDecorators().find((d) => d.getName() === 'ApplyFilter');
    if (!filterDecorator) continue;
    const args = filterDecorator.getArguments();
    if (args.length === 0) continue;
    const filterClassArg = args[0];
    if (!filterClassArg || !Node.isIdentifier(filterClassArg)) continue;

    // Read { source: "body" | "query" } from second argument
    let source: 'body' | 'query' = 'query';
    const optionsArg = args[1];
    if (optionsArg && Node.isObjectLiteralExpression(optionsArg)) {
      const sourceProp = optionsArg.getProperty('source');
      if (sourceProp && Node.isPropertyAssignment(sourceProp)) {
        const init = sourceProp.getInitializer();
        if (init && Node.isStringLiteral(init) && init.getLiteralValue() === 'body') {
          source = 'body';
        }
      }
    }

    const filterClassName = filterClassArg.getText();
    const resolved = findType(filterClassName, sourceFile, project);
    if (resolved && resolved.kind === 'class') {
      const classDecl = resolved.decl as ClassDeclaration;
      let fieldNames = extractClassPropertyNames(classDecl);

      // autoFields: if the filter class has no properties, resolve fields
      // from the entity referenced in @Filterable({ entity: X })
      if (fieldNames.length === 0) {
        fieldNames = extractFilterableEntityFields(classDecl, project);
      }

      if (fieldNames.length === 0) return null;
      const fieldsUnion = fieldNames.map((f) => JSON.stringify(f)).join(' | ');
      return {
        queryType: `import('@dudousxd/nestjs-filter-client').TypedFilterQuery<${fieldsUnion}>`,
        fieldNames,
        source,
      };
    }
  }
  return null;
}

const RELATION_DECORATORS = new Set(['OneToMany', 'ManyToOne', 'ManyToMany', 'OneToOne']);

/**
 * Recursively collect entity fields including dot-notation relation fields.
 * e.g. for PipelineRun with tasks: OneToMany<Task>, produces:
 *   ["id", "name", "status", ..., "tasks.id", "tasks.name", ...]
 */
function collectEntityFields(
  entityDecl: ClassDeclaration,
  sourceFile: SourceFile,
  project: Project,
  prefix: string,
  visited: Set<string>,
): string[] {
  const entityName = entityDecl.getName() ?? '';
  if (visited.has(entityName)) return [];
  visited.add(entityName);

  const fields: string[] = [];
  for (const prop of entityDecl.getProperties()) {
    const name = prop.getName();
    if (name.startsWith('$') || name.startsWith('_') || name.startsWith('[')) continue;
    if (prop.isStatic()) continue;

    const fullName = prefix ? `${prefix}.${name}` : name;
    const isRelation = prop.getDecorators().some((d) => RELATION_DECORATORS.has(d.getName()));

    if (isRelation) {
      const relEntity = resolveRelationEntity(prop, sourceFile, project);
      if (relEntity) {
        fields.push(...collectEntityFields(relEntity, sourceFile, project, fullName, visited));
      }
    } else {
      fields.push(fullName);
    }
  }
  return fields;
}

/**
 * Given a relation property (e.g. `tasks = new Collection<Task>(this)`),
 * resolve the target entity class declaration.
 */
function resolveRelationEntity(
  prop: PropertyDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassDeclaration | null {
  // Try from decorator argument: @OneToMany({ entity: () => Task, ... })
  for (const dec of prop.getDecorators()) {
    if (!RELATION_DECORATORS.has(dec.getName())) continue;
    const args = dec.getArguments();
    if (args.length === 0) continue;
    const arg = args[0];
    if (Node.isObjectLiteralExpression(arg)) {
      const entityProp = arg.getProperty('entity');
      if (entityProp && Node.isPropertyAssignment(entityProp)) {
        const init = entityProp.getInitializer();
        // () => Task
        if (init && Node.isArrowFunction(init)) {
          const body = init.getBody();
          if (Node.isIdentifier(body)) {
            const resolved = findType(body.getText(), prop.getSourceFile(), project);
            if (resolved?.kind === 'class') return resolved.decl as ClassDeclaration;
          }
        }
      }
    }
    // @ManyToOne(() => Task)
    if (Node.isArrowFunction(arg)) {
      const body = arg.getBody();
      if (Node.isIdentifier(body)) {
        const resolved = findType(body.getText(), prop.getSourceFile(), project);
        if (resolved?.kind === 'class') return resolved.decl as ClassDeclaration;
      }
    }
  }
  return null;
}

function extractClassPropertyNames(classDecl: ClassDeclaration): string[] {
  const names: string[] = [];
  for (const prop of classDecl.getProperties()) {
    const name = prop.getName();
    if (name.startsWith('$') || name.startsWith('_')) continue;
    names.push(name);
  }
  return names;
}

/**
 * When a filter class uses `@Filterable({ entity: X, autoFields: true })`,
 * resolve entity X and extract its property names (fields decorated with
 * `@Property`, `@PrimaryKey`, `@Enum`, etc. — skipping relations).
 */
function extractFilterableEntityFields(filterClass: ClassDeclaration, project: Project): string[] {
  const filterableDecorator = filterClass.getDecorators().find((d) => d.getName() === 'Filterable');
  if (!filterableDecorator) return [];
  const args = filterableDecorator.getArguments();
  if (args.length === 0) return [];

  const optionsArg = args[0];
  if (!Node.isObjectLiteralExpression(optionsArg)) return [];

  const entityProp = optionsArg.getProperty('entity');
  if (!entityProp || !Node.isPropertyAssignment(entityProp)) return [];

  const entityInit = entityProp.getInitializer();
  if (!entityInit || !Node.isIdentifier(entityInit)) return [];

  const entityName = entityInit.getText();
  const filterSourceFile = filterClass.getSourceFile();
  const resolvedEntity = findType(entityName, filterSourceFile, project);
  if (!resolvedEntity || resolvedEntity.kind !== 'class') return [];

  const fields = collectEntityFields(
    resolvedEntity.decl as ClassDeclaration,
    filterSourceFile,
    project,
    '',
    new Set(),
  );

  // Also include keys declared via @Relations({ rel: { keys: [...] } })
  const relationsDecorator = filterClass.getDecorators().find((d) => d.getName() === 'Relations');
  if (relationsDecorator) {
    const relArgs = relationsDecorator.getArguments();
    if (relArgs.length > 0 && Node.isObjectLiteralExpression(relArgs[0])) {
      for (const relProp of relArgs[0].getProperties()) {
        if (!Node.isPropertyAssignment(relProp)) continue;
        const relInit = relProp.getInitializer();
        if (!relInit || !Node.isObjectLiteralExpression(relInit)) continue;
        const keysProp = relInit.getProperty('keys');
        if (!keysProp || !Node.isPropertyAssignment(keysProp)) continue;
        const keysInit = keysProp.getInitializer();
        if (!keysInit || !Node.isArrayLiteralExpression(keysInit)) continue;
        for (const el of keysInit.getElements()) {
          if (Node.isStringLiteral(el)) {
            fields.push(el.getLiteralValue());
          }
        }
      }
    }
  }

  return fields;
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
 * Try to resolve a TypeNode to a named exported type reference.
 * Returns { name, filePath } if the type is a named export, null otherwise.
 * Unwraps Promise<T> and Array<T> to find the inner named type.
 */
function tryResolveTypeRef(
  typeNode: TypeNode,
  sourceFile: SourceFile,
  project: Project,
): TypeRef | null {
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const name = Node.isIdentifier(typeName) ? typeName.getText() : null;
    if (!name) return null;

    // Unwrap Promise<T>
    if (name === 'Promise') {
      const typeArgs = typeNode.getTypeArguments();
      const first = typeArgs[0];
      if (first) return tryResolveTypeRef(first, sourceFile, project);
      return null;
    }

    // Array<T> generic form
    if (name === 'Array') {
      const typeArgs = typeNode.getTypeArguments();
      const first = typeArgs[0];
      if (first) {
        const inner = tryResolveTypeRef(first, sourceFile, project);
        if (inner) return { ...inner, isArray: true };
      }
      return null;
    }

    // Skip primitives and well-known types
    if (['string', 'number', 'boolean', 'void', 'unknown', 'any', 'Date'].includes(name)) {
      return null;
    }

    // Check if it's exported from the current file
    const localDecl =
      sourceFile.getInterface(name) || sourceFile.getClass(name) || sourceFile.getTypeAlias(name);
    if (localDecl?.isExported()) {
      return { name, filePath: sourceFile.getFilePath() };
    }

    // Check if it's imported and exported from another file
    const resolved = resolveImportedType(name, sourceFile, project);
    if (resolved && (resolved.kind === 'class' || resolved.kind === 'interface')) {
      const decl = resolved.decl;
      if (decl.isExported()) {
        return { name, filePath: resolved.file.getFilePath() };
      }
    }
  }

  // T[] syntax — check inner type
  if (Node.isArrayTypeNode(typeNode)) {
    const inner = tryResolveTypeRef(typeNode.getElementTypeNode(), sourceFile, project);
    if (inner) return { ...inner, isArray: true };
  }

  return null;
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
} | null {
  let body = extractBodyType(method, sourceFile, project);
  const filterInfo = extractApplyFilterInfo(method, sourceFile, project);
  let query = extractQueryType(method, sourceFile, project);

  // Place filter type on the correct field based on @ApplyFilter source
  if (filterInfo) {
    const bodyType = "import('@dudousxd/nestjs-filter-client').FilterQueryResult";
    if (filterInfo.source === 'body') {
      body = body ?? bodyType;
    } else {
      query = query ?? filterInfo.queryType;
    }
  }

  const paramsType = extractParamsType(method, sourceFile, project);
  const response = extractResponseType(method, sourceFile, project);

  // Only emit a contract if there is at least something useful
  if (body === null && query === null && paramsType === null && response === 'unknown') {
    return null;
  }

  // Capture type references for import generation
  let bodyRef: TypeRef | null = null;
  let queryRef: TypeRef | null = null;
  let responseRef: TypeRef | null = null;

  for (const param of method.getParameters()) {
    if (param.getDecorators().some((d) => d.getName() === 'Body') && param.getTypeNode()) {
      bodyRef = tryResolveTypeRef(param.getTypeNode()!, sourceFile, project);
    }
    if (param.getDecorators().some((d) => d.getName() === 'Query') && param.getTypeNode()) {
      queryRef = tryResolveTypeRef(param.getTypeNode()!, sourceFile, project);
    }
  }

  const returnTypeNode = method.getReturnTypeNode();
  if (returnTypeNode) {
    responseRef = tryResolveTypeRef(returnTypeNode, sourceFile, project);
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

  return {
    query,
    body,
    response,
    params: paramsType,
    queryRef,
    bodyRef,
    responseRef,
    filterFields: filterInfo?.fieldNames ?? null,
    filterSource: filterInfo?.source ?? null,
  };
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
        let contractDef: {
          query: string | null;
          body: string | null;
          response: string;
        } | null = null;

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
              queryRef: dtoContract?.queryRef,
              bodyRef: dtoContract?.bodyRef,
              responseRef: dtoContract?.responseRef,
              filterFields: dtoContract?.filterFields ?? null,
              filterSource: dtoContract?.filterSource ?? null,
            },
          },
        });
      }
    }
  }

  return routes;
}
