/**
 * Unit tests for zodAstToTs — the AST-based counterpart of zodToTs.
 * Uses ts-morph in-memory projects to parse snippets and feed AST nodes
 * to the walker, mirroring the zod-to-ts.spec.ts behaviour surface.
 */
import { Project, SyntaxKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { zodAstToTs } from '../../src/discovery/contracts-fast.js';

/** Parse a TypeScript expression snippet and return the root CallExpression node. */
function parseExpr(snippet: string) {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const src = project.createSourceFile('__test__.ts', `const _x = ${snippet};`);
  const decl = src.getVariableDeclarations()[0];
  const init = decl?.getInitializer();
  if (!init) throw new Error(`No initializer in: ${snippet}`);
  return init;
}

describe('zodAstToTs', () => {
  it('handles z.string()', () => {
    expect(zodAstToTs(parseExpr('z.string()'))).toBe('string');
  });

  it('handles z.number()', () => {
    expect(zodAstToTs(parseExpr('z.number()'))).toBe('number');
  });

  it('handles z.boolean()', () => {
    expect(zodAstToTs(parseExpr('z.boolean()'))).toBe('boolean');
  });

  it('handles z.unknown()', () => {
    expect(zodAstToTs(parseExpr('z.unknown()'))).toBe('unknown');
  });

  it('handles z.any()', () => {
    expect(zodAstToTs(parseExpr('z.any()'))).toBe('unknown');
  });

  it('handles z.literal with string', () => {
    expect(zodAstToTs(parseExpr('z.literal("foo")'))).toBe('"foo"');
  });

  it('handles z.literal with number', () => {
    expect(zodAstToTs(parseExpr('z.literal(42)'))).toBe('42');
  });

  it('handles z.literal with boolean', () => {
    expect(zodAstToTs(parseExpr('z.literal(true)'))).toBe('true');
  });

  it('handles z.enum', () => {
    const result = zodAstToTs(parseExpr('z.enum(["a", "b", "c"])'));
    expect(result).toBe('"a" | "b" | "c"');
  });

  it('handles z.array of string', () => {
    expect(zodAstToTs(parseExpr('z.array(z.string())'))).toBe('Array<string>');
  });

  it('handles z.array of object', () => {
    const result = zodAstToTs(parseExpr('z.array(z.object({ id: z.string() }))'));
    expect(result).toBe('Array<{ id: string }>');
  });

  it('handles z.object flat', () => {
    const result = zodAstToTs(parseExpr('z.object({ id: z.string(), count: z.number() })'));
    expect(result).toBe('{ id: string; count: number }');
  });

  it('handles z.object with optional field', () => {
    const result = zodAstToTs(parseExpr('z.object({ active: z.boolean().optional() })'));
    expect(result).toBe('{ active?: boolean | undefined }');
  });

  it('handles nested z.object', () => {
    const result = zodAstToTs(
      parseExpr('z.object({ user: z.object({ id: z.string(), name: z.string() }) })'),
    );
    expect(result).toBe('{ user: { id: string; name: string } }');
  });

  it('handles .optional() chain on primitive', () => {
    expect(zodAstToTs(parseExpr('z.string().optional()'))).toBe('string | undefined');
  });

  it('handles .nullable() chain on primitive', () => {
    expect(zodAstToTs(parseExpr('z.string().nullable()'))).toBe('string | null');
  });

  it('handles z.union', () => {
    const result = zodAstToTs(parseExpr('z.union([z.string(), z.number()])'));
    expect(result).toBe('string | number');
  });

  it('handles z.record with value type', () => {
    expect(zodAstToTs(parseExpr('z.record(z.number())'))).toBe('Record<string, number>');
  });

  it('handles z.record with key+value types', () => {
    expect(zodAstToTs(parseExpr('z.record(z.string(), z.number())'))).toBe(
      'Record<string, number>',
    );
  });

  it('handles z.tuple', () => {
    const result = zodAstToTs(parseExpr('z.tuple([z.string(), z.number()])'));
    expect(result).toBe('[string, number]');
  });

  it('returns unknown for unrecognized call', () => {
    expect(zodAstToTs(parseExpr('z.weirdThing()'))).toBe('unknown');
  });

  it('handles complex fixture: query with optional boolean', () => {
    const result = zodAstToTs(parseExpr('z.object({ active: z.boolean().optional() })'));
    expect(result).toContain('active');
    expect(result).toContain('boolean');
  });

  it('handles complex fixture: response array with id and name', () => {
    const result = zodAstToTs(parseExpr('z.array(z.object({ id: z.string(), name: z.string() }))'));
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('string');
  });
});
