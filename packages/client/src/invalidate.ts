import type { QueryClient } from '@tanstack/query-core';

/**
 * Invalidates queries matching `name` (and optionally `queryArgs`).
 *
 * - `invalidate(qc, 'users.list')`            → invalidates `['users.list']`
 * - `invalidate(qc, 'users.list', { id: 1 })` → invalidates `['users.list', { id: 1 }]`
 */
export function invalidate(qc: QueryClient, name: string, queryArgs?: unknown): Promise<void> {
  const queryKey = queryArgs === undefined ? [name] : [name, queryArgs];
  return qc.invalidateQueries({ queryKey });
}
