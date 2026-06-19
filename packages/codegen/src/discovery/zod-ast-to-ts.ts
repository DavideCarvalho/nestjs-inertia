// packages/codegen/src/discovery/zod-ast-to-ts.ts
//
// AST-based Zod → TypeScript type-source converter. Extracted from
// contracts-fast.ts (it has its own unit suite, zod-ast-to-ts.spec.ts) so the
// discovery module stays focused on route/contract extraction.
import { Node, SyntaxKind } from 'ts-morph';

/** Return true when `node` is a CallExpression ending in `.optional()`. */
function isOptionalChain(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;
  const expr = node.getExpression();
  return Node.isPropertyAccessExpression(expr) && expr.getName() === 'optional';
}

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
