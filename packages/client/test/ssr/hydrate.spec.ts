import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/query-core';
import { hydrateClientFromInertia, seedInitialQueries } from '../../src/ssr/hydrate.js';

describe('hydrateClientFromInertia', () => {
  it('seeds queries from page._initialQueries', () => {
    const page = { props: { _initialQueries: [[['users.list', undefined], [{ id: '1' }]]] } };
    const qc = hydrateClientFromInertia(page as any);
    expect(qc.getQueryData(['users.list', undefined])).toEqual([{ id: '1' }]);
  });

  it('returns a QueryClient even when _initialQueries is absent', () => {
    const qc = hydrateClientFromInertia({ props: {} });
    expect(qc).toBeInstanceOf(QueryClient);
  });

  it('returns a QueryClient when props is absent', () => {
    const qc = hydrateClientFromInertia({});
    expect(qc).toBeInstanceOf(QueryClient);
  });

  it('seeds multiple queries', () => {
    const page = {
      props: {
        _initialQueries: [
          [['users.list', undefined], [{ id: '1' }]],
          [['users.list', { active: true }], [{ id: '2' }]],
        ],
      },
    };
    const qc = hydrateClientFromInertia(page as any);
    expect(qc.getQueryData(['users.list', undefined])).toEqual([{ id: '1' }]);
    expect(qc.getQueryData(['users.list', { active: true }])).toEqual([{ id: '2' }]);
  });
});

describe('seedInitialQueries', () => {
  it('serializes queryClient cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(['users.list', undefined], [{ id: '1' }]);
    const seeded = seedInitialQueries(qc);
    expect(seeded).toContainEqual([['users.list', undefined], [{ id: '1' }]]);
  });

  it('returns empty array when cache is empty', () => {
    const qc = new QueryClient();
    expect(seedInitialQueries(qc)).toEqual([]);
  });
});
