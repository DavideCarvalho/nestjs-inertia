import { describe, it, expect } from 'vitest';
import { zodToTs } from '../../src/discovery/zod-to-ts.js';
import { z } from 'zod';

describe('zodToTs', () => {
  it('handles ZodString', () => {
    expect(zodToTs(z.string())).toBe('string');
  });

  it('handles ZodNumber', () => {
    expect(zodToTs(z.number())).toBe('number');
  });

  it('handles ZodBoolean', () => {
    expect(zodToTs(z.boolean())).toBe('boolean');
  });

  it('handles ZodLiteral string', () => {
    expect(zodToTs(z.literal('foo'))).toBe('"foo"');
  });

  it('handles ZodLiteral number', () => {
    expect(zodToTs(z.literal(42))).toBe('42');
  });

  it('handles ZodEnum', () => {
    const result = zodToTs(z.enum(['a', 'b', 'c']));
    expect(result).toBe('"a" | "b" | "c"');
  });

  it('handles ZodArray of string', () => {
    expect(zodToTs(z.array(z.string()))).toBe('Array<string>');
  });

  it('handles ZodArray of object', () => {
    const result = zodToTs(z.array(z.object({ id: z.string() })));
    expect(result).toBe('Array<{ id: string }>');
  });

  it('handles ZodOptional', () => {
    expect(zodToTs(z.string().optional())).toBe('string | undefined');
  });

  it('handles ZodNullable', () => {
    expect(zodToTs(z.string().nullable())).toBe('string | null');
  });

  it('handles ZodUnion', () => {
    const result = zodToTs(z.union([z.string(), z.number()]));
    expect(result).toBe('string | number');
  });

  it('handles ZodObject flat', () => {
    const result = zodToTs(z.object({ id: z.string(), count: z.number() }));
    expect(result).toBe('{ id: string; count: number }');
  });

  it('handles ZodObject with optional field', () => {
    const result = zodToTs(z.object({ active: z.boolean().optional() }));
    expect(result).toBe('{ active?: boolean | undefined }');
  });

  it('handles nested ZodObject', () => {
    const result = zodToTs(z.object({ user: z.object({ id: z.string(), name: z.string() }) }));
    expect(result).toBe('{ user: { id: string; name: string } }');
  });

  it('handles ZodRecord', () => {
    expect(zodToTs(z.record(z.number()))).toBe('Record<string, number>');
  });

  it('handles ZodTuple', () => {
    expect(zodToTs(z.tuple([z.string(), z.number()]))).toBe('[string, number]');
  });

  it('handles ZodUnknown', () => {
    expect(zodToTs(z.unknown())).toBe('unknown');
  });

  it('handles ZodAny', () => {
    expect(zodToTs(z.any())).toBe('unknown');
  });

  it('returns unknown for unrecognized schema', () => {
    expect(zodToTs({ _def: { typeName: 'ZodWeird' } })).toBe('unknown');
  });

  it('returns unknown for null input', () => {
    expect(zodToTs(null)).toBe('unknown');
  });

  it('handles complex fixture: query with optional boolean', () => {
    const query = z.object({ active: z.boolean().optional() });
    const result = zodToTs(query);
    expect(result).toContain('active');
    expect(result).toContain('boolean');
  });

  it('handles complex fixture: response array with id and name', () => {
    const response = z.array(z.object({ id: z.string(), name: z.string() }));
    const result = zodToTs(response);
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('string');
  });
});
