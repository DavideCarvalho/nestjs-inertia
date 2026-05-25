/**
 * Static AST-based discovery of shared props from `InertiaModule.forRoot({ share: ... })`.
 *
 * Analyzes the `share` property in the forRoot call to infer the return type
 * of the share function and generate typed shared props.
 *
 * Gracefully returns null when the share function cannot be analyzed
 * (complex logic, service calls, external references, etc.).
 */
import { Node, type Project, type SourceFile, SyntaxKind } from 'ts-morph';

export interface SharedPropsResult {
  /** The TS type string — either `Awaited<ReturnType<typeof import('...').fn>>` or an inline object type */
  typeString: string;
  /** Individual property entries for emitting into an interface body (null when using ReturnType) */
  properties: Array<{ name: string; type: string }> | null;
  /** When true, typeString is a ReturnType<import(...)> expression (not inline) */
  isImportRef: boolean;
}

/**
 * Discover shared props by analyzing `InertiaModule.forRoot({ share: ... })` in the given module entry file.
 *
 * @param project - ts-morph Project (caller creates it)
 * @param moduleEntry - Absolute path to the NestJS module entry file (e.g. `src/app.module.ts`)
 * @returns SharedPropsResult or null if no share function found or it can't be inferred
 */
export function discoverSharedProps(
  project: Project,
  moduleEntry: string,
): SharedPropsResult | null {
  try {
    let sourceFile = project.getSourceFile(moduleEntry);
    if (!sourceFile) {
      try {
        sourceFile = project.addSourceFileAtPath(moduleEntry);
      } catch {
        return null;
      }
    }

    const forRootCall = findForRootCall(sourceFile);
    if (!forRootCall) return null;

    const initializer = findShareInitializer(forRootCall);
    if (!initializer) return null;

    return extractShareType(initializer, sourceFile, project);
  } catch {
    // Graceful fallback — any unexpected error means we skip shared props typing
    return null;
  }
}

/**
 * Find `InertiaModule.forRoot(...)` call expression in a source file.
 * Searches all call expressions in the file.
 */
function findForRootCall(sourceFile: SourceFile): Node | null {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;

    const methodName = expr.getName();
    const objectExpr = expr.getExpression();

    if (methodName === 'forRoot' && Node.isIdentifier(objectExpr)) {
      const name = objectExpr.getText();
      if (name === 'InertiaModule') {
        return call;
      }
    }
  }

  return null;
}

/**
 * Extract the initializer of the `share` property from the first argument of `forRoot(...)`.
 * Returns the initializer node (the value assigned to `share`), or null if not found.
 */
function findShareInitializer(forRootCall: Node): Node | null {
  if (!Node.isCallExpression(forRootCall)) return null;

  const args = forRootCall.getArguments();
  const firstArg = args[0];
  if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) return null;

  for (const prop of firstArg.getProperties()) {
    if (Node.isPropertyAssignment(prop) && prop.getName() === 'share') {
      return prop.getInitializer() ?? null;
    }
  }

  return null;
}

/**
 * Extract the return type of the share value.
 * Handles:
 *   - Arrow functions: `(req) => ({ ... })`
 *   - Arrow functions with block body: `(req) => { return { ... }; }`
 *   - Function expressions: `function(req) { return { ... }; }`
 *   - Async variants of the above
 *   - Object literals (plain `share: { ... }`)
 *   - Functions with explicit return type annotations
 */
function extractShareType(
  node: Node,
  sourceFile: SourceFile,
  project: Project,
): SharedPropsResult | null {
  // Priority 1: Reference to a named function → use ReturnType<typeof import(...)>
  if (Node.isIdentifier(node)) {
    const ref = resolveIdentifierToImportRef(node, sourceFile, project);
    if (ref) {
      return {
        typeString: `Awaited<ReturnType<typeof import('${ref.importPath}').${ref.exportName}>>`,
        properties: null,
        isImportRef: true,
      };
    }
  }

  // Priority 2: Arrow function → try inline extraction
  if (Node.isArrowFunction(node)) {
    const result = extractFromFunctionLike(node, sourceFile);
    return result ? { ...result, isImportRef: false } : null;
  }

  // Priority 3: Function expression → try inline extraction
  if (Node.isFunctionExpression(node)) {
    const result = extractFromFunctionLike(node, sourceFile);
    return result ? { ...result, isImportRef: false } : null;
  }

  // Priority 4: Object literal (share: { key: value })
  if (Node.isObjectLiteralExpression(node)) {
    const result = extractFromObjectLiteral(node);
    return result ? { ...result, isImportRef: false } : null;
  }

  return null;
}

function resolveIdentifierToImportRef(
  id: Node,
  sourceFile: SourceFile,
  project: Project,
): { importPath: string; exportName: string } | null {
  if (!Node.isIdentifier(id)) return null;
  const name = id.getText();

  const localFunc = sourceFile.getFunction(name);
  if (localFunc?.isExported()) {
    const filePath = sourceFile.getFilePath().replace(/\.ts$/, '');
    return { importPath: filePath, exportName: name };
  }

  const localVar = sourceFile.getVariableDeclaration(name);
  if (localVar?.isExported()) {
    const filePath = sourceFile.getFilePath().replace(/\.ts$/, '');
    return { importPath: filePath, exportName: name };
  }

  for (const imp of sourceFile.getImportDeclarations()) {
    for (const named of imp.getNamedImports()) {
      const importedName = named.getAliasNode()?.getText() ?? named.getName();
      if (importedName !== name) continue;
      const resolvedSource = imp.getModuleSpecifierSourceFile();
      if (!resolvedSource) continue;
      const originalName = named.getName();
      const fn = resolvedSource.getFunction(originalName);
      if (fn?.isExported()) {
        const filePath = resolvedSource.getFilePath().replace(/\.ts$/, '');
        return { importPath: filePath, exportName: originalName };
      }
      const v = resolvedSource.getVariableDeclaration(originalName);
      if (v?.isExported()) {
        const filePath = resolvedSource.getFilePath().replace(/\.ts$/, '');
        return { importPath: filePath, exportName: originalName };
      }
    }
  }

  return null;
}

/**
 * Extract shared props type from an arrow function or function expression.
 * First tries the return type annotation; falls back to inferring from the return value.
 */
function extractFromFunctionLike(node: Node, _sourceFile: SourceFile): SharedPropsResult | null {
  // Check for explicit return type annotation
  const returnTypeNode =
    Node.isArrowFunction(node) || Node.isFunctionExpression(node) ? node.getReturnTypeNode() : null;

  if (returnTypeNode) {
    return extractFromReturnTypeAnnotation(returnTypeNode);
  }

  // Infer from body
  if (Node.isArrowFunction(node)) {
    const body = node.getBody();

    // Concise body: (req) => ({ auth: ..., flash: ... })
    if (Node.isParenthesizedExpression(body)) {
      const inner = body.getExpression();
      if (Node.isObjectLiteralExpression(inner)) {
        return extractFromObjectLiteral(inner);
      }
    }

    // Direct object literal (less common but possible with as const)
    if (Node.isObjectLiteralExpression(body)) {
      return extractFromObjectLiteral(body);
    }

    // Block body: (req) => { return { ... }; }
    if (Node.isBlock(body)) {
      return extractFromBlockReturn(body);
    }
  }

  if (Node.isFunctionExpression(node)) {
    const body = node.getBody();
    if (Node.isBlock(body)) {
      return extractFromBlockReturn(body);
    }
  }

  return null;
}

/**
 * Extract type from a return type annotation on the share function.
 * e.g. `(req): { auth: User | null; flash: {} } => ...`
 */
function extractFromReturnTypeAnnotation(typeNode: Node): SharedPropsResult | null {
  // Unwrap Promise<T> if async
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    if (Node.isIdentifier(typeName) && typeName.getText() === 'Promise') {
      const typeArgs = typeNode.getTypeArguments();
      const firstArg = typeArgs[0];
      if (firstArg) {
        return extractFromReturnTypeAnnotation(firstArg);
      }
      return null;
    }
  }

  // TypeLiteral: { auth: ...; flash: ... }
  if (Node.isTypeLiteral(typeNode)) {
    const properties: Array<{ name: string; type: string }> = [];
    for (const member of typeNode.getMembers()) {
      if (Node.isPropertySignature(member)) {
        const name = member.getName();
        const memberTypeNode = member.getTypeNode();
        const type = memberTypeNode ? memberTypeNode.getText() : 'unknown';
        properties.push({ name, type });
      }
    }
    if (properties.length === 0) return null;
    const typeString = `{ ${properties.map((p) => `${p.name}: ${p.type}`).join('; ')} }`;
    return { typeString, properties, isImportRef: false };
  }

  return null;
}

/**
 * Extract shared props from a block body's return statement.
 * Only handles the simple case: a single return statement with an object literal.
 */
function extractFromBlockReturn(block: Node): SharedPropsResult | null {
  if (!Node.isBlock(block)) return null;

  const statements = block.getStatements();
  // Find the last return statement
  for (let i = statements.length - 1; i >= 0; i--) {
    const stmt = statements[i];
    if (!Node.isReturnStatement(stmt)) continue;

    const expr = stmt.getExpression();
    if (!expr) continue;

    if (Node.isObjectLiteralExpression(expr)) {
      return extractFromObjectLiteral(expr);
    }

    // Parenthesized: return ({ ... })
    if (Node.isParenthesizedExpression(expr)) {
      const inner = expr.getExpression();
      if (Node.isObjectLiteralExpression(inner)) {
        return extractFromObjectLiteral(inner);
      }
    }

    break;
  }

  return null;
}

/**
 * Infer shared props type from an object literal expression.
 * Each property key becomes a shared prop; the value type is inferred from the value expression.
 */
function extractFromObjectLiteral(objLiteral: Node): SharedPropsResult | null {
  if (!Node.isObjectLiteralExpression(objLiteral)) return null;

  const properties: Array<{ name: string; type: string }> = [];

  for (const prop of objLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;

    const name = prop.getName();
    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const type = inferExpressionType(initializer);
    properties.push({ name, type });
  }

  if (properties.length === 0) return null;

  const typeString = `{ ${properties.map((p) => `${p.name}: ${p.type}`).join('; ')} }`;
  return { typeString, properties, isImportRef: false };
}

/**
 * Infer the TypeScript type of an expression.
 * Handles common patterns found in share functions:
 * - Object literals → `{ key: type; ... }`
 * - String literals → `string`
 * - Number literals → `number`
 * - Boolean literals → `boolean`
 * - Null → `null`
 * - Array literals → `Array<type>`
 * - Ternary expressions → `trueType | falseType`
 * - Property accesses and complex expressions → `unknown`
 * - Empty object literal → `Record<string, unknown>`
 */
function inferExpressionType(node: Node): string {
  // String literal
  if (Node.isStringLiteral(node)) return 'string';

  // Template literal (backtick)
  if (Node.isTemplateExpression(node) || Node.isNoSubstitutionTemplateLiteral(node))
    return 'string';

  // Number literal
  if (Node.isNumericLiteral(node)) return 'number';

  // Boolean literal
  if (node.getKind() === SyntaxKind.TrueKeyword || node.getKind() === SyntaxKind.FalseKeyword) {
    return 'boolean';
  }

  // Null literal
  if (node.getKind() === SyntaxKind.NullKeyword) return 'null';

  // Undefined
  if (Node.isIdentifier(node) && node.getText() === 'undefined') return 'undefined';

  // Object literal
  if (Node.isObjectLiteralExpression(node)) {
    const props = node.getProperties();
    if (props.length === 0) return 'Record<string, unknown>';

    const entries: string[] = [];
    for (const prop of props) {
      if (!Node.isPropertyAssignment(prop)) continue;
      const key = prop.getName();
      const init = prop.getInitializer();
      if (!init) continue;
      entries.push(`${key}: ${inferExpressionType(init)}`);
    }
    if (entries.length === 0) return 'Record<string, unknown>';
    return `{ ${entries.join('; ')} }`;
  }

  // Array literal
  if (Node.isArrayLiteralExpression(node)) {
    const elements = node.getElements();
    if (elements.length === 0) return 'Array<unknown>';
    // Infer from first element
    const first = elements[0];
    if (first) return `Array<${inferExpressionType(first)}>`;
    return 'Array<unknown>';
  }

  // Ternary (conditional) expression: x ? A : B → A | B
  if (Node.isConditionalExpression(node)) {
    const whenTrue = inferExpressionType(node.getWhenTrue());
    const whenFalse = inferExpressionType(node.getWhenFalse());
    if (whenTrue === whenFalse) return whenTrue;
    return `${whenTrue} | ${whenFalse}`;
  }

  // Parenthesized expression — unwrap
  if (Node.isParenthesizedExpression(node)) {
    return inferExpressionType(node.getExpression());
  }

  // As expression (type assertion): expr as Type → use the asserted type
  if (Node.isAsExpression(node)) {
    const typeNode = node.getTypeNode();
    if (typeNode) return typeNode.getText();
  }

  // For any other expression (property access, function calls, etc.), fall back to unknown
  return 'unknown';
}
