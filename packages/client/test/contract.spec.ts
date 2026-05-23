import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineContract } from '../src/contract/contract.js';
import { CONTRACT_METADATA, getContract } from '../src/contract/metadata.js';

describe('defineContract', () => {
  it('returns the definition object unchanged', () => {
    const def = {
      name: 'users.list',
      query: z.object({ q: z.string() }),
      response: z.array(z.object({ id: z.string() })),
    };
    const c = defineContract(def);
    expect(c).toBe(def);
  });

  it('carries name, query, response fields', () => {
    const c = defineContract({
      name: 'users.list',
      query: z.object({ q: z.string() }),
      response: z.array(z.object({ id: z.string() })),
    });
    expect(c.name).toBe('users.list');
    expect(c.response).toBeDefined();
    expect(c.query).toBeDefined();
  });

  it('carries body field for mutation contracts', () => {
    const c = defineContract({
      name: 'users.create',
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
    });
    expect(c.name).toBe('users.create');
    expect(c.body).toBeDefined();
    expect(c.response).toBeDefined();
  });

  it('has no method or path fields', () => {
    const c = defineContract({
      name: 'users.list',
      response: z.object({ ok: z.boolean() }),
    });
    expect((c as Record<string, unknown>)['method']).toBeUndefined();
    expect((c as Record<string, unknown>)['path']).toBeUndefined();
  });

  it('carries params and error fields when provided', () => {
    const c = defineContract({
      name: 'users.show',
      params: z.object({ id: z.string() }),
      response: z.object({ id: z.string() }),
      error: z.object({ message: z.string() }),
    });
    expect(c.params).toBeDefined();
    expect(c.error).toBeDefined();
  });
});

describe('CONTRACT_METADATA symbol', () => {
  it('is a Symbol', () => {
    expect(typeof CONTRACT_METADATA).toBe('symbol');
    expect(CONTRACT_METADATA.toString()).toContain('nestjs-inertia:contract');
  });
});

describe('getContract', () => {
  it('returns undefined for non-functions', () => {
    expect(getContract(null)).toBeUndefined();
    expect(getContract({})).toBeUndefined();
    expect(getContract(42)).toBeUndefined();
  });

  it('returns contract metadata set via Reflect.defineMetadata', () => {
    const c = defineContract({
      name: 'test.get',
      response: z.object({ ok: z.boolean() }),
    });
    function handler() {}
    Reflect.defineMetadata(CONTRACT_METADATA, c, handler);
    expect(getContract(handler)).toBe(c);
  });
});
