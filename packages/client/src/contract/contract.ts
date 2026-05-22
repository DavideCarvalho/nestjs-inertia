import type { z } from 'zod';

export interface ContractDef<Path extends string, Query, Body, Response> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: Path;
  name?: string;
  query?: z.ZodType<Query>;
  body?: z.ZodType<Body>;
  response: z.ZodType<Response>;
}

export const Contract = {
  get<Path extends string, Q = unknown, R = unknown>(
    path: Path,
    def: Omit<ContractDef<Path, Q, never, R>, 'method' | 'path'>,
  ): ContractDef<Path, Q, never, R> {
    return { method: 'GET', path, ...def } as ContractDef<Path, Q, never, R>;
  },

  post<Path extends string, Q = unknown, B = unknown, R = unknown>(
    path: Path,
    def: Omit<ContractDef<Path, Q, B, R>, 'method' | 'path'>,
  ): ContractDef<Path, Q, B, R> {
    return { method: 'POST', path, ...def } as ContractDef<Path, Q, B, R>;
  },

  put<Path extends string, Q = unknown, B = unknown, R = unknown>(
    path: Path,
    def: Omit<ContractDef<Path, Q, B, R>, 'method' | 'path'>,
  ): ContractDef<Path, Q, B, R> {
    return { method: 'PUT', path, ...def } as ContractDef<Path, Q, B, R>;
  },

  patch<Path extends string, Q = unknown, B = unknown, R = unknown>(
    path: Path,
    def: Omit<ContractDef<Path, Q, B, R>, 'method' | 'path'>,
  ): ContractDef<Path, Q, B, R> {
    return { method: 'PATCH', path, ...def } as ContractDef<Path, Q, B, R>;
  },

  delete<Path extends string, Q = unknown, R = unknown>(
    path: Path,
    def: Omit<ContractDef<Path, Q, never, R>, 'method' | 'path'>,
  ): ContractDef<Path, Q, never, R> {
    return { method: 'DELETE', path, ...def } as ContractDef<Path, Q, never, R>;
  },
};
