import { dirname, join, resolve } from 'node:path';
import fg from 'fast-glob';
/**
 * Static AST-based contract discovery using ts-morph.
 * Cold start ~100-500 ms.
 */
import {
  type ClassDeclaration,
  type MethodDeclaration,
  Node,
  Project,
  type SourceFile,
  SyntaxKind,
  type TypeNode,
} from 'ts-morph';
import type { RouteDescriptor } from './types.js';

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

  for (const sourceFile of project.getSourceFiles()) {
    routes.push(...extractFromSourceFile(sourceFile, project));
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

/**
 * Follow an import declaration to find a class in another file.
 * Returns the ClassDeclaration + its SourceFile, or null.
 */
function resolveImportedClass(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): { cls: ClassDeclaration; file: SourceFile } | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImport = importDecl.getNamedImports().find((n) => n.getName() === name);
    if (!namedImport) continue;

    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    // Skip non-relative imports (node_modules)
    if (!moduleSpecifier.startsWith('.')) return null;

    const dir = dirname(sourceFile.getFilePath());
    const candidates = [
      resolve(dir, `${moduleSpecifier}.ts`),
      resolve(dir, moduleSpecifier, 'index.ts'),
    ];

    for (const candidate of candidates) {
      let importedFile = project.getSourceFile(candidate);
      if (!importedFile) {
        try {
          importedFile = project.addSourceFileAtPath(candidate);
        } catch {
          continue;
        }
      }
      const cls = importedFile.getClass(name);
      if (cls) return { cls, file: importedFile };
    }
  }
  return null;
}

/**
 * Find a class declaration by name: first in the current file, then by following imports.
 */
function findClass(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): { cls: ClassDeclaration; file: SourceFile } | null {
  const local = sourceFile.getClass(name);
  if (local) return { cls: local, file: sourceFile };
  return resolveImportedClass(name, sourceFile, project);
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

  // TypeReference: Foo, Foo[], Array<Foo>, Promise<Foo>, etc.
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const name = Node.isIdentifier(typeName) ? typeName.getText() : typeNode.getText();

    // Well-known pass-through primitives and types
    if (name === 'string' || name === 'number' || name === 'boolean') return name;
    if (name === 'Date') return 'string';
    if (name === 'unknown' || name === 'any') return 'unknown';

    // Array<T> generic form
    if (name === 'Array') {
      const typeArgs = typeNode.getTypeArguments();
      const firstTypeArg = typeArgs[0];
      if (typeArgs.length > 0 && firstTypeArg !== undefined) {
        return `Array<${resolveTypeNodeToString(firstTypeArg, sourceFile, project, depth)}>`;
      }
      return 'Array<unknown>';
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

    // Try same file first, then follow imports
    const resolved = findClass(name, sourceFile, project);
    if (resolved) {
      return resolveClassDeclaration(resolved.cls, resolved.file, project, depth - 1);
    }

    // Fall back: use the name as-is
    return name;
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
 * Turn a class declaration's properties into a TS object type string like
 * `{ id: string; title: string; page?: number }`.
 */
function resolveClassDeclaration(
  cls: ClassDeclaration,
  sourceFile: SourceFile,
  project: Project,
  depth: number,
): string {
  if (depth < 0) return 'unknown';

  const lines: string[] = [];
  for (const prop of cls.getProperties()) {
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
function extractBodyType(method: MethodDeclaration, sourceFile: SourceFile, project: Project): string | null {
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
function extractQueryType(method: MethodDeclaration, sourceFile: SourceFile, project: Project): string | null {
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
function extractParamsType(method: MethodDeclaration, sourceFile: SourceFile, project: Project): string | null {
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
    const paramType = typeNode ? resolveTypeNodeToString(typeNode, sourceFile, project, 3) : 'string';
    entries.push(`${paramName}: ${paramType}`);
  }
  return entries.length > 0 ? `{ ${entries.join('; ')} }` : null;
}

/**
 * Extract the response type from `@ApiResponse({ type: X })` or `@ApiResponse({ type: [X] })`.
 * Falls back to the method return type annotation (unwrapping `Promise<>`).
 * Returns a TS type string (never null — falls back to 'unknown').
 */
function extractResponseType(method: MethodDeclaration, sourceFile: SourceFile, project: Project): string {
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
function resolveIdentifierToClassType(node: Node, sourceFile: SourceFile, project: Project, depth: number): string {
  if (!Node.isIdentifier(node)) return 'unknown';
  const name = node.getText();
  const resolved = findClass(name, sourceFile, project);
  if (resolved) {
    return resolveClassDeclaration(resolved.cls, resolved.file, project, depth - 1);
  }
  return name;
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
): { query: string | null; body: string | null; response: string; params: string | null } | null {
  const body = extractBodyType(method, sourceFile, project);
  const query = extractQueryType(method, sourceFile, project);
  const paramsType = extractParamsType(method, sourceFile, project);
  const response = extractResponseType(method, sourceFile, project);

  // Only emit a contract if there is at least something useful
  if (body === null && query === null && paramsType === null && response === 'unknown') {
    return null;
  }

  return { query, body, response, params: paramsType };
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
        const routeName = `${className}.${methodName}`;

        // ── DTO-based contract extraction ──────────────────────────────────
        const dtoContract = extractDtoContract(method, sourceFile, project);

        routes.push({
          method: httpMethod,
          path: combined,
          name: routeName,
          params,
          // Attach contract if DTO extraction produced useful type info
          ...(dtoContract
            ? {
                contract: {
                  contractSource: {
                    query: dtoContract.query,
                    body: dtoContract.body,
                    response: dtoContract.response,
                  },
                },
              }
            : {}),
        });
      }
    }
  }

  return routes;
}
