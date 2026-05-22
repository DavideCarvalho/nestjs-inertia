import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Contract } from '../src/contract/contract.js';
import { CONTRACT_METADATA, getContract } from '../src/contract/metadata.js';

describe('Contract builders', () => {
  it('builds a GET contract with query + response', () => {
    const c = Contract.get('/users', {
      query: z.object({ q: z.string() }),
      response: z.array(z.object({ id: z.string() })),
      name: 'users.list',
    });
    expect(c.method).toBe('GET');
    expect(c.path).toBe('/users');
    expect(c.name).toBe('users.list');
    expect(c.response).toBeDefined();
    expect(c.query).toBeDefined();
  });

  it('builds a POST contract with body + response', () => {
    const c = Contract.post('/users', {
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
      name: 'users.create',
    });
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/users');
    expect(c.body).toBeDefined();
    expect(c.response).toBeDefined();
  });

  it('builds a PUT contract', () => {
    const c = Contract.put('/users/:id', {
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
      name: 'users.update',
    });
    expect(c.method).toBe('PUT');
    expect(c.path).toBe('/users/:id');
  });

  it('builds a PATCH contract', () => {
    const c = Contract.patch('/users/:id', {
      body: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
      name: 'users.patch',
    });
    expect(c.method).toBe('PATCH');
    expect(c.path).toBe('/users/:id');
  });

  it('builds a DELETE contract', () => {
    const c = Contract.delete('/users/:id', {
      response: z.object({ ok: z.boolean() }),
      name: 'users.delete',
    });
    expect(c.method).toBe('DELETE');
    expect(c.path).toBe('/users/:id');
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
    const c = Contract.get('/test', {
      response: z.object({ ok: z.boolean() }),
      name: 'test.get',
    });
    function handler() {}
    Reflect.defineMetadata(CONTRACT_METADATA, c, handler);
    expect(getContract(handler)).toBe(c);
  });
});
