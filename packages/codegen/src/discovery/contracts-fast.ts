import { join, resolve } from 'node:path';
import fg from 'fast-glob';
/**
 * Static AST-based contract discovery using ts-morph.
 * Cold start ~100-500 ms.
 */
import { Node, Project, type SourceFile, SyntaxKind } from 'ts-morph';
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
    routes.push(...extractFromSourceFile(sourceFile));
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

/** Build a RouteDescriptor from a discovered contract call expression. */
function buildRouteDescriptor(
  contractName: string,
  contractCallExpr: Node,
  controllerPrefix: string,
): RouteDescriptor | null {
  if (!Node.isCallExpression(contractCallExpr)) return null;

  // Contract.get('/path', { ... }) — method is the property name
  const calleeExpr = contractCallExpr.getExpression();
  if (!Node.isPropertyAccessExpression(calleeExpr)) return null;

  const httpMethodRaw = calleeExpr.getName(); // 'get', 'post', etc.
  const method = httpMethodRaw.toUpperCase();

  const args = contractCallExpr.getArguments();
  const pathArg = args[0];
  if (!pathArg || !Node.isStringLiteral(pathArg)) return null;
  const handlerPath = pathArg.getLiteralValue();

  // Combine prefix + handler path
  const combined = joinPaths(controllerPrefix, handlerPath);
  const params = extractParams(combined);

  // Optional options object
  const optsArg = args[1];
  let name: string | undefined = undefined;
  let query: string | null = null;
  let body: string | null = null;
  let response = 'unknown';

  if (optsArg && Node.isObjectLiteralExpression(optsArg)) {
    for (const prop of optsArg.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;
      const propName = prop.getName();
      const val = prop.getInitializer();
      if (!val) continue;

      if (propName === 'name' && Node.isStringLiteral(val)) {
        name = val.getLiteralValue();
      } else if (propName === 'query') {
        query = zodAstToTs(val);
      } else if (propName === 'body') {
        body = zodAstToTs(val);
      } else if (propName === 'response') {
        response = zodAstToTs(val);
      }
    }
  }

  return {
    method,
    path: combined,
    name: contractName,
    params,
    contract: {
      name,
      method,
      path: combined,
      contractSource: { query, body, response },
    },
  };
}

/** Join two URL path segments, normalising duplicate slashes. */
function joinPaths(prefix: string, suffix: string): string {
  const p = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return p + s;
}

/** Extract path params from a URL pattern string, e.g. `/users/:id` → [{name:'id',source:'path'}] */
function extractParams(
  path: string,
): Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }> {
  const matches = path.matchAll(/:(\w+)/g);
  return Array.from(matches).map((m) => ({ name: m[1] as string, source: 'path' as const }));
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
};

// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------

function extractFromSourceFile(sourceFile: SourceFile): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];

  const classes = sourceFile.getClasses();

  for (const cls of classes) {
    // Find @Controller(...) decorator
    const controllerDecorator = cls.getDecorator('Controller');
    if (!controllerDecorator) continue;

    // Determine controller path prefix
    const controllerArgs = controllerDecorator.getArguments();
    const firstArg = controllerArgs[0];
    const prefix = decoratorStringArg(firstArg) ?? '';

    // Walk all methods
    for (const method of cls.getMethods()) {
      const applyContractDecorator = method.getDecorator('ApplyContract');

      if (applyContractDecorator) {
        // ── @ApplyContract path ──────────────────────────────────────────
        const decoratorArgs = applyContractDecorator.getArguments();
        const firstDecoratorArg = decoratorArgs[0];
        if (!firstDecoratorArg) continue;

        if (Node.isCallExpression(firstDecoratorArg)) {
          // B-3 fix: inline Contract.get(...) call — pass directly to buildRouteDescriptor
          const descriptor = buildRouteDescriptor(
            `${cls.getName() ?? 'Unknown'}.${method.getName()}`,
            firstDecoratorArg,
            prefix,
          );
          if (descriptor) {
            routes.push(descriptor);
          }
          continue;
        }

        // The argument must be an identifier (variable name)
        if (!Node.isIdentifier(firstDecoratorArg)) {
          console.warn(
            `[nestjs-inertia-codegen/fast] @ApplyContract arg is not an identifier or call expression in ${sourceFile.getFilePath()} — skipping`,
          );
          continue;
        }

        const identName = firstDecoratorArg.getText();

        // Resolve the identifier to a variable declaration IN THIS SOURCE FILE
        const varDecl = sourceFile.getVariableDeclaration(identName);
        if (!varDecl) {
          console.warn(
            `[nestjs-inertia-codegen/fast] Cannot resolve '${identName}' in ${sourceFile.getFilePath()} (cross-file imports are out-of-scope for v1) — skipping`,
          );
          continue;
        }

        const initializer = varDecl.getInitializer();
        if (!initializer) continue;

        const descriptor = buildRouteDescriptor(identName, initializer, prefix);
        if (descriptor) {
          routes.push(descriptor);
        }
      } else {
        // ── @Get / @Post / @Put / @Patch / @Delete / @Inertia path (no @ApplyContract) ──
        // Enumerate methods with HTTP verb decorators (parity with heavy probe)
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

        if (!httpMethod) continue; // No HTTP verb decorator — skip

        const combined = joinPaths(prefix, handlerPath);
        const params = extractParams(combined);

        // Use class.method as route name (same convention as heavy probe)
        const className = cls.getName() ?? 'Unknown';
        const methodName = method.getName();
        const routeName = `${className}.${methodName}`;

        routes.push({
          method: httpMethod,
          path: combined,
          name: routeName,
          params,
          // No contract — goes into routes.ts only, not api.ts
        });
      }
    }
  }

  return routes;
}
