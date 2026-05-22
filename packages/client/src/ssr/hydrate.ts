import { QueryClient } from '@tanstack/query-core';

/**
 * Creates a QueryClient pre-seeded with data from an Inertia page's
 * `_initialQueries` prop (set by the server during SSR).
 *
 * Expected shape:
 *   page.props._initialQueries = Array<[queryKey: unknown[], data: unknown]>
 */
export function hydrateClientFromInertia(page: {
  props?: { _initialQueries?: Array<[unknown[], unknown]> };
}): QueryClient {
  const qc = new QueryClient();
  const queries = page.props?._initialQueries ?? [];
  for (const [key, data] of queries) {
    qc.setQueryData(key as readonly unknown[], data);
  }
  return qc;
}

/**
 * Serialises the entire QueryClient cache into a plain array that can be
 * passed as the `_initialQueries` Inertia prop on the server side.
 */
export function seedInitialQueries(qc: QueryClient): Array<[unknown[], unknown]> {
  return qc
    .getQueryCache()
    .getAll()
    .map((q) => [q.queryKey as unknown[], q.state.data]);
}
