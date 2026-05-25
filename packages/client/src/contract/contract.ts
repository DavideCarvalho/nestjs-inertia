import type { z } from 'zod';

export interface ContractDef<Q = unknown, B = unknown, R = unknown, P = unknown, E = unknown> {
  query?: z.ZodType<Q>;
  body?: z.ZodType<B>;
  response: z.ZodType<R>;
  params?: z.ZodType<P>;
  error?: z.ZodType<E>;
}

/* v8 ignore next -- generic function declaration is not a branch */
export function defineContract<Q = unknown, B = unknown, R = unknown, P = unknown, E = unknown>(
  def: ContractDef<Q, B, R, P, E>,
): ContractDef<Q, B, R, P, E> {
  return def;
}
