export interface PrefetchOptions {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
}
