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
import { extractZodFromDto } from './dto-to-zod.js';
import type { FieldTypeKind, FilterFieldType, RouteDescriptor, TypeRef } from './types.js';

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

export type TypeDeclResult =
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
      // String value → quoted literal ("active"); numeric value → numeric
      // literal (1). Fall back to the member NAME only when the value can't be
      // resolved statically (e.g. a computed member).
      if (typeof val === 'string' || typeof val === 'number') return JSON.stringify(val);
      return JSON.stringify(m.getName());
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
    // Strip an explicit ESM `.js`/`.ts` extension so `./x.dto.js` resolves to
    // `./x.dto.ts` (NodeNext import style).
    const noExt = moduleSpecifier.replace(/\.(js|ts)$/, '');
    return [
      resolve(dir, `${noExt}.ts`),
      resolve(dir, `${moduleSpecifier}.ts`),
      resolve(dir, moduleSpecifier, 'index.ts'),
    ];
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
export function findType(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): TypeDeclResult | null {
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

// ---------------------------------------------------------------------------
// Field-type classification (mirrors mapTypeOrmType / mapMikroOrmType so codegen
// and the runtime adapters can never diverge). See nestjs-filter
// packages/typeorm/src/typeorm.adapter.ts:190 (mapTypeOrmType).
// ---------------------------------------------------------------------------

/** Reference: typeorm.adapter.ts keyword tables (kept in sync intentionally). */
const STRING_TYPE_KEYWORDS = ['varchar', 'text', 'string', 'char', 'uuid', 'enum'];
const NUMBER_TYPE_KEYWORDS = ['int', 'float', 'double', 'decimal', 'number', 'numeric', 'real'];
const BOOLEAN_TYPE_KEYWORDS = ['bool', 'boolean', 'bit'];
const DATE_TYPE_KEYWORDS = ['date', 'time', 'timestamp', 'datetime'];
const JSON_TYPE_KEYWORDS = ['json', 'jsonb'];

/** Classify a column/property type literal (e.g. 'varchar') the same way mapTypeOrmType does. */
function classifyTypeKeyword(raw: string): FieldTypeKind | null {
  const t = raw.toLowerCase();
  if (STRING_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'string';
  if (NUMBER_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'number';
  if (BOOLEAN_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'boolean';
  if (DATE_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'date';
  if (JSON_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'json';
  return null;
}

interface ClassifyResult {
  kind: FieldTypeKind;
  enumValues?: string[];
  nullable?: boolean;
  numericEnum?: boolean;
  /** Importable reference to a named enum / type alias / interface (option B). */
  typeRef?: TypeRef;
}

/**
 * Return `r` with `nullable: true` set only when `nullable` is true.
 * Avoids assigning `undefined` to an optional prop under exactOptionalPropertyTypes.
 */
function markNullable(r: ClassifyResult, nullable: boolean): ClassifyResult {
  return nullable ? { ...r, nullable: true } : r;
}

/** Resolve an enum identifier to its raw member values + numeric flag. */
function resolveEnumValues(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): { values: string[]; numeric: boolean } | null {
  const resolved = findType(name, sourceFile, project);
  if (!resolved || resolved.kind !== 'enum') return null;
  // members are JSON.stringify'd ("A" / "0"); strip quotes to raw values.
  let numeric = true;
  const values = resolved.members.map((m) => {
    const parsed = JSON.parse(m) as string | number;
    if (typeof parsed === 'string') numeric = false;
    return String(parsed);
  });
  if (values.length === 0) return null;
  return { values, numeric };
}

/** Classify a TS type node into a field-type kind (+ enum members / nullable). */
function classifyTypeNode(
  typeNode: TypeNode,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult {
  // Union: strip null/undefined, collect literal members, recurse otherwise.
  if (Node.isUnionTypeNode(typeNode)) {
    let nullable = false;
    const stringLits: string[] = [];
    const numberLits: string[] = [];
    const others: TypeNode[] = [];
    for (const member of typeNode.getTypeNodes()) {
      const kind = member.getKind();
      if (kind === SyntaxKind.NullKeyword || kind === SyntaxKind.UndefinedKeyword) {
        nullable = true;
        continue;
      }
      if (Node.isLiteralTypeNode(member)) {
        const lit = member.getLiteral();
        if (Node.isStringLiteral(lit)) {
          stringLits.push(lit.getLiteralValue());
          continue;
        }
        if (Node.isNumericLiteral(lit)) {
          numberLits.push(lit.getText());
          continue;
        }
        if (lit.getKind() === SyntaxKind.NullKeyword) {
          nullable = true;
          continue;
        }
      }
      others.push(member);
    }

    if (others.length === 0 && stringLits.length > 0 && numberLits.length === 0) {
      return markNullable({ kind: 'string', enumValues: stringLits }, nullable);
    }
    if (others.length === 0 && numberLits.length > 0 && stringLits.length === 0) {
      return markNullable({ kind: 'number', enumValues: numberLits, numericEnum: true }, nullable);
    }
    if (others.length === 1) {
      const inner = classifyTypeNode(others[0]!, sourceFile, project);
      return markNullable(inner, nullable || inner.nullable === true);
    }
    return markNullable({ kind: 'unknown' }, nullable);
  }

  switch (typeNode.getKind()) {
    case SyntaxKind.StringKeyword:
      return { kind: 'string' };
    case SyntaxKind.NumberKeyword:
      return { kind: 'number' };
    case SyntaxKind.BooleanKeyword:
      return { kind: 'boolean' };
    case SyntaxKind.AnyKeyword:
    case SyntaxKind.UnknownKeyword:
      return { kind: 'unknown' };
    default:
      break;
  }

  if (Node.isTypeReference(typeNode)) {
    const refName = typeNode.getTypeName().getText();
    if (refName === 'Date') return { kind: 'date' };
    if (refName === 'Record' || refName === 'Object') return { kind: 'json' };
    // Possibly an enum type used as a property type.
    const en = resolveEnumValues(refName, sourceFile, project);
    if (en) {
      return en.numeric
        ? { kind: 'number', enumValues: en.values, numericEnum: true }
        : { kind: 'string', enumValues: en.values };
    }
    return { kind: 'unknown' };
  }

  if (Node.isTypeLiteral(typeNode)) return { kind: 'json' };

  return { kind: 'unknown' };
}

/** Resolve an enum from @Enum decorator args: `() => Status` or `{ items: () => Status }`. */
function enumFromDecoratorArgs(
  args: Node[],
  sourceFile: SourceFile,
  project: Project,
): { values: string[]; numeric: boolean } | null {
  for (const arg of args) {
    if (Node.isArrowFunction(arg)) {
      const body = arg.getBody();
      if (Node.isIdentifier(body)) {
        const en = resolveEnumValues(body.getText(), sourceFile, project);
        if (en) return en;
      }
    }
    if (Node.isObjectLiteralExpression(arg)) {
      const itemsProp = arg.getProperty('items');
      if (itemsProp && Node.isPropertyAssignment(itemsProp)) {
        const init = itemsProp.getInitializer();
        if (init && Node.isArrowFunction(init)) {
          const body = init.getBody();
          if (Node.isIdentifier(body)) {
            const en = resolveEnumValues(body.getText(), sourceFile, project);
            if (en) return en;
          }
        }
      }
    }
  }
  return null;
}

/** Classify a property from `@Column`/`@Property`/`@Enum` decorator options. */
function classifyFromColumnDecorator(
  prop: PropertyDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult | null {
  for (const dec of prop.getDecorators()) {
    const decName = dec.getName();
    if (decName !== 'Column' && decName !== 'Property' && decName !== 'Enum') continue;
    const args = dec.getArguments();

    // @Enum({ items: () => Status }) or @Enum(() => Status)
    if (decName === 'Enum') {
      const en = enumFromDecoratorArgs(args, sourceFile, project);
      if (en) {
        return en.numeric
          ? { kind: 'number', enumValues: en.values, numericEnum: true }
          : { kind: 'string', enumValues: en.values };
      }
      return { kind: 'string' };
    }

    for (const arg of args) {
      // @Column('varchar')
      if (Node.isStringLiteral(arg)) {
        const raw = arg.getLiteralValue();
        const kind = classifyTypeKeyword(raw);
        if (kind) {
          // @Column('enum', { enum: Status }) → resolve via the options object below
          if (kind === 'string' && raw.toLowerCase().includes('enum')) continue;
          return { kind };
        }
      }
      // @Column({ type: 'datetime' }) / @Property({ type: 'int' }) / { enum: Status }
      if (Node.isObjectLiteralExpression(arg)) {
        const enumProp = arg.getProperty('enum');
        if (enumProp && Node.isPropertyAssignment(enumProp)) {
          const init = enumProp.getInitializer();
          if (init && Node.isIdentifier(init)) {
            const en = resolveEnumValues(init.getText(), sourceFile, project);
            if (en) {
              return en.numeric
                ? { kind: 'number', enumValues: en.values, numericEnum: true }
                : { kind: 'string', enumValues: en.values };
            }
            return { kind: 'string' };
          }
        }
        const typeProp = arg.getProperty('type');
        if (typeProp && Node.isPropertyAssignment(typeProp)) {
          const init = typeProp.getInitializer();
          if (init && Node.isStringLiteral(init)) {
            const kind = classifyTypeKeyword(init.getLiteralValue());
            if (kind) return { kind };
          }
        }
      }
    }
    // Decorator present but no recognisable type info.
    return null;
  }
  return null;
}

/**
 * Classify a single entity/DTO property into a ClassifyResult (kind + enum + nullable),
 * mirroring the runtime ORM type mapping. Falls back to 'unknown' when unresolvable.
 */
function classifyFieldType(
  prop: PropertyDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult {
  let nullable = prop.hasQuestionToken();
  const typeNode = prop.getTypeNode();

  if (typeNode) {
    const r = classifyTypeNode(typeNode, sourceFile, project);
    if (r.nullable) nullable = true;
    if (r.kind !== 'unknown') return markNullable(r, nullable);
  }

  const fromDecorator = classifyFromColumnDecorator(prop, sourceFile, project);
  if (fromDecorator) {
    return markNullable(fromDecorator, nullable || fromDecorator.nullable === true);
  }

  return markNullable({ kind: 'unknown' }, nullable);
}

/** Build a FilterFieldType from a classified property + its (possibly dotted) name. */
function toFilterFieldType(name: string, r: ClassifyResult): FilterFieldType {
  const ft: FilterFieldType = { name, kind: r.kind };
  if (r.enumValues && r.enumValues.length > 0) ft.enumValues = r.enumValues;
  if (r.nullable) ft.nullable = true;
  if (r.numericEnum) ft.numericEnum = true;
  if (r.typeRef) ft.typeRef = r.typeRef;
  return ft;
}

/**
 * Map a single `@FilterFor` `type` hint token (read statically from the AST) to a
 * `ClassifyResult`. Supports the four primitive tokens plus a string-literal
 * array (enum) → literal string union. Returns null for anything unrecognised so
 * the caller falls back to the current permissive (`unknown`) behavior.
 */
function classifyFilterForHint(typeInit: Node): ClassifyResult | null {
  // Primitive token: 'string' | 'number' | 'boolean' | 'Date'
  if (Node.isStringLiteral(typeInit)) {
    switch (typeInit.getLiteralValue()) {
      case 'string':
        return { kind: 'string' };
      case 'number':
        return { kind: 'number' };
      case 'boolean':
        return { kind: 'boolean' };
      case 'Date':
        return { kind: 'date' };
      default:
        return null;
    }
  }

  // Enum: a readonly array of string literals → literal string union.
  if (Node.isArrayLiteralExpression(typeInit)) {
    const values: string[] = [];
    for (const el of typeInit.getElements()) {
      if (!Node.isStringLiteral(el)) return null; // non-literal → bail to permissive
      values.push(el.getLiteralValue());
    }
    if (values.length === 0) return null;
    return { kind: 'string', enumValues: values };
  }

  return null;
}

/** The declaration kinds a `resolveTypeRef` call will accept as an importable ref. */
type TypeRefKind = 'class' | 'interface' | 'typeAlias' | 'enum';

interface ResolveTypeRefOptions {
  /**
   * Declaration kinds accepted as an importable named ref (applied identically
   * to local and imported declarations). The two call sites differ only here:
   *   - body/query/response refs accept class + interface;
   *   - `@FilterFor` param refs also accept enum + type alias.
   */
  kinds: TypeRefKind[];
  /**
   * Honour a bare (node_modules) import specifier — emit `{ name, filePath: spec }`
   * so the emitter imports straight from the package. tsconfig path aliases are
   * excluded (they resolve to files instead). Off for the body/query/response
   * path (which only ever points at project source files).
   */
  allowBareSpecifier?: boolean;
  /**
   * Unwrap `Promise<T>`, `Array<T>` and `T[]` to the inner named type (marking
   * array forms with `isArray`). Used for the body/query/response path which
   * receives a raw return/param `TypeNode`; the `@FilterFor` path passes a bare
   * symbol name and needs no unwrapping.
   */
  unwrapContainers?: boolean;
}

/** Skip-list of primitive / well-known names that never resolve to a named ref. */
const _NON_REF_NAMES = new Set([
  'string',
  'number',
  'boolean',
  'void',
  'unknown',
  'any',
  'Date',
]);

/** Does an exported declaration found by `findTypeInFile` match the accepted kinds? */
function _localDeclForKinds(
  name: string,
  file: SourceFile,
  kinds: TypeRefKind[],
): boolean {
  if (kinds.includes('class') && file.getClass(name)?.isExported()) return true;
  if (kinds.includes('interface') && file.getInterface(name)?.isExported()) return true;
  if (kinds.includes('typeAlias') && file.getTypeAlias(name)?.isExported()) return true;
  if (kinds.includes('enum') && file.getEnum(name)?.isExported()) return true;
  return false;
}

/**
 * Resolve a type reference to an importable `TypeRef` — the symbol name plus the
 * absolute path of its declaring source file (for a relative import) OR the bare
 * module specifier (for a node_modules package). Accepts either a raw `TypeNode`
 * (with `unwrapContainers` to peel `Promise`/`Array`) or a bare symbol name.
 *
 * Walks: local exported decl → `{ name, thisFile }`; else the file's import
 * declarations to a matching exported decl → `{ name, importedFile }`. The
 * accepted declaration kinds (and bare-specifier / container-unwrap support) are
 * controlled by `opts`, letting both former resolvers share this one body.
 * Returns null when the symbol is not exported, not resolvable, or its import
 * path cannot be safely computed.
 */
function resolveTypeRef(
  nodeOrName: TypeNode | string,
  sourceFile: SourceFile,
  project: Project,
  opts: ResolveTypeRefOptions,
): TypeRef | null {
  // ── Resolve the bare symbol name (peeling containers for the TypeNode form) ──
  let name: string;
  if (typeof nodeOrName === 'string') {
    name = nodeOrName;
  } else {
    const typeNode = nodeOrName;

    if (opts.unwrapContainers && Node.isArrayTypeNode(typeNode)) {
      const inner = resolveTypeRef(typeNode.getElementTypeNode(), sourceFile, project, opts);
      return inner ? { ...inner, isArray: true } : null;
    }

    if (!Node.isTypeReference(typeNode)) return null;
    const typeName = typeNode.getTypeName();
    const refName = Node.isIdentifier(typeName) ? typeName.getText() : null;
    if (!refName) return null;

    if (opts.unwrapContainers && refName === 'Promise') {
      const first = typeNode.getTypeArguments()[0];
      return first ? resolveTypeRef(first, sourceFile, project, opts) : null;
    }
    if (opts.unwrapContainers && refName === 'Array') {
      const first = typeNode.getTypeArguments()[0];
      if (!first) return null;
      const inner = resolveTypeRef(first, sourceFile, project, opts);
      return inner ? { ...inner, isArray: true } : null;
    }

    if (_NON_REF_NAMES.has(refName)) return null;
    name = refName;
  }

  // 1. Declared (and exported) in the current file → relative import to it.
  if (_localDeclForKinds(name, sourceFile, opts.kinds)) {
    return { name, filePath: sourceFile.getFilePath() };
  }

  // 2. Imported from another module — follow the import declaration.
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImport = importDecl.getNamedImports().find((n) => n.getName() === name);
    if (!namedImport) continue;
    const moduleSpecifier = importDecl.getModuleSpecifierValue();

    // Bare specifier (node_modules package) → import directly by specifier.
    if (
      opts.allowBareSpecifier &&
      !moduleSpecifier.startsWith('.') &&
      !moduleSpecifier.startsWith('/')
    ) {
      // Only honour it if not a tsconfig path alias (those resolve to files).
      const tsconfigPaths = _tsconfigPaths();
      const isAlias =
        tsconfigPaths != null &&
        Object.keys(tsconfigPaths).some((p) => {
          const prefix = p.replace('*', '');
          return moduleSpecifier.startsWith(prefix);
        });
      if (!isAlias) {
        return { name, filePath: moduleSpecifier };
      }
    }

    // Local / aliased source file → resolve to its absolute path so the emitter
    // can compute a relative import from the generated output dir.
    const candidates = resolveModuleSpecifier(moduleSpecifier, sourceFile, project);
    for (const candidate of candidates) {
      let importedFile = project.getSourceFile(candidate);
      if (!importedFile) {
        try {
          importedFile = project.addSourceFileAtPath(candidate);
        } catch {
          continue;
        }
      }
      if (_localDeclForKinds(name, importedFile, opts.kinds)) {
        return { name, filePath: importedFile.getFilePath() };
      }
    }
  }

  return null;
}

/**
 * Classify the type of the FIRST parameter of a `@FilterFor` method (the new
 * primary inference mechanism). Precedence inside this function:
 *   - primitive `number`/`string`/`boolean`/`Date` → emit directly.
 *   - literal unions (`'a' | 'b'`, `1 | 2`) → emit the union text.
 *   - named enum / type alias / interface → emit a `typeRef` (named import,
 *     option B) when an import path is resolvable; otherwise fall back to
 *     literal-union expansion for enums/unions, else skip.
 *   - any/unknown/no-param/unresolvable → null (caller falls back).
 */
function classifyFilterForParam(
  method: MethodDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult | null {
  const param = method.getParameters()[0];
  if (!param) return null;
  const typeNode = param.getTypeNode();
  if (!typeNode) return null;

  // Named type reference: try to emit a real import (option B). For an enum /
  // type alias / interface we prefer a named `import type`; only fall back to
  // literal expansion when no safe import path exists.
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const refName = Node.isIdentifier(typeName) ? typeName.getText() : null;
    if (refName) {
      // Primitives / well-known names are handled by classifyTypeNode below.
      const wellKnown = ['string', 'number', 'boolean', 'Date', 'any', 'unknown'];
      if (!wellKnown.includes(refName)) {
        const resolvedDecl = findType(refName, sourceFile, project);
        // Only attempt a named import for symbols we can resolve to an
        // enum / type alias / interface / class declaration.
        if (resolvedDecl) {
          const typeRef = resolveTypeRef(refName, sourceFile, project, {
            kinds: ['class', 'interface', 'typeAlias', 'enum'],
            allowBareSpecifier: true,
          });
          if (typeRef) {
            // We still record a best-effort `kind` so non-emit consumers
            // (e.g. tests) see a sensible classification, but the emitter
            // prefers `typeRef`.
            const base = classifyTypeNode(typeNode, sourceFile, project);
            return { ...base, typeRef };
          }
          // No safe import path — fall back to literal expansion when the
          // type is a statically-known enum/union; else skip.
          const fallback = classifyTypeNode(typeNode, sourceFile, project);
          if (fallback.kind !== 'unknown') return fallback;
          return null;
        }
        // Unresolvable named type → skip (fall back to existing behavior).
        return null;
      }
    }
  }

  const r = classifyTypeNode(typeNode, sourceFile, project);
  return r.kind === 'unknown' ? null : r;
}

/**
 * Discover virtual filter fields declared via `@FilterFor('key', { type })`
 * method decorators on the filter class. Field-type resolution precedence (high
 * wins): (1) explicit `{ type }` hint, (2) the method's first-parameter type
 * (named enums/aliases → real `import type` refs), (3+) fall back to existing
 * class-property / entity-column / `unknown` behavior (handled by the caller).
 *
 * Returns a map of inputKey → classified type for every `@FilterFor` that
 * carries a usable hint OR a usable first-parameter type. Keys with neither are
 * intentionally omitted here (they remain permissive / fall back).
 */
function extractFilterForHints(
  classDecl: ClassDeclaration,
  project: Project,
): Map<string, ClassifyResult> {
  const hints = new Map<string, ClassifyResult>();
  const sourceFile = classDecl.getSourceFile();
  for (const method of classDecl.getMethods()) {
    const filterForDec = method.getDecorators().find((d) => d.getName() === 'FilterFor');
    if (!filterForDec) continue;

    const args = filterForDec.getArguments();
    // inputKey: first string-literal arg, else the method name.
    const keyArg = args[0];
    const inputKey =
      keyArg && Node.isStringLiteral(keyArg) ? keyArg.getLiteralValue() : method.getName();

    // (1) Explicit `{ type }` hint — highest precedence, unchanged behavior.
    const optsArg = args[1];
    if (optsArg && Node.isObjectLiteralExpression(optsArg)) {
      const typeProp = optsArg.getProperty('type');
      if (typeProp && Node.isPropertyAssignment(typeProp)) {
        const typeInit = typeProp.getInitializer();
        if (typeInit) {
          const classified = classifyFilterForHint(typeInit);
          if (classified) {
            hints.set(inputKey, classified);
            continue;
          }
        }
      }
    }

    // (2) Method first-parameter type — the new primary inference mechanism.
    const fromParam = classifyFilterForParam(method, sourceFile, project);
    if (fromParam) hints.set(inputKey, fromParam);
  }
  return hints;
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
): {
  fieldNames: string[];
  fieldTypes: FilterFieldType[];
  source: 'body' | 'query';
} | null {
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
      let fieldTypes = extractClassPropertyTypes(classDecl, project);

      // autoFields: if the filter class has no properties, resolve fields
      // from the entity referenced in @Filterable({ entity: X })
      if (fieldTypes.length === 0) {
        fieldTypes = extractFilterableEntityFields(classDecl, project);
      }

      // Merge in explicit @FilterFor('key', { type }) hints. An explicit hint
      // WINS over entity-column / class-property inference for the same key;
      // genuinely-virtual keys (no property, no column) are appended so they
      // appear in the Fields union and the type map M.
      const filterForHints = extractFilterForHints(classDecl, project);
      if (filterForHints.size > 0) {
        const byName = new Map(fieldTypes.map((f) => [f.name, f] as const));
        for (const [key, classified] of filterForHints) {
          byName.set(key, toFilterFieldType(key, classified));
        }
        fieldTypes = [...byName.values()];
      }

      if (fieldTypes.length === 0) return null;
      const fieldNames = fieldTypes.map((f) => f.name);
      return {
        fieldNames,
        fieldTypes,
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
): FilterFieldType[] {
  const entityName = entityDecl.getName() ?? '';
  if (visited.has(entityName)) return [];
  visited.add(entityName);

  const fields: FilterFieldType[] = [];
  for (const prop of entityDecl.getProperties()) {
    const name = prop.getName();
    if (name.startsWith('$') || name.startsWith('_') || name.startsWith('[')) continue;
    if (prop.isStatic()) continue;

    const fullName = prefix ? `${prefix}.${name}` : name;
    const isRelation = prop.getDecorators().some((d) => RELATION_DECORATORS.has(d.getName()));

    if (isRelation) {
      const relEntity = resolveRelationEntity(prop, sourceFile, project);
      if (relEntity) {
        // Classify each relation leaf against the relation's own source file.
        fields.push(
          ...collectEntityFields(relEntity, relEntity.getSourceFile(), project, fullName, visited),
        );
      }
    } else {
      fields.push(toFilterFieldType(fullName, classifyFieldType(prop, sourceFile, project)));
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

/** Classify each property of a filter DTO class into a FilterFieldType. */
function extractClassPropertyTypes(
  classDecl: ClassDeclaration,
  project: Project,
): FilterFieldType[] {
  const sourceFile = classDecl.getSourceFile();
  const fields: FilterFieldType[] = [];
  for (const prop of classDecl.getProperties()) {
    const name = prop.getName();
    if (name.startsWith('$') || name.startsWith('_')) continue;
    fields.push(toFilterFieldType(name, classifyFieldType(prop, sourceFile, project)));
  }
  return fields;
}

/**
 * When a filter class uses `@Filterable({ entity: X, autoFields: true })`,
 * resolve entity X and extract its property names (fields decorated with
 * `@Property`, `@PrimaryKey`, `@Enum`, etc. — skipping relations).
 */
function extractFilterableEntityFields(
  filterClass: ClassDeclaration,
  project: Project,
): FilterFieldType[] {
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

  const entityDecl = resolvedEntity.decl as ClassDeclaration;
  const fields = collectEntityFields(entityDecl, entityDecl.getSourceFile(), project, '', new Set());

  // Also include keys declared via @Relations({ rel: { keys: [...] } }).
  // These string keys carry no resolvable type → kind: 'unknown'.
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
            fields.push({ name: el.getLiteralValue(), kind: 'unknown' });
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
  let query = extractQueryType(method, sourceFile, project);

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
