import { Get, Post, Put, Patch, Delete, SetMetadata, applyDecorators } from '@nestjs/common';
import { CONTRACT_METADATA } from './metadata.js';
import type { ContractDef } from './contract.js';

type HttpMethodKey = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const METHOD_DECORATORS: Record<HttpMethodKey, (path: string) => MethodDecorator> = {
  GET:    Get,
  POST:   Post,
  PUT:    Put,
  PATCH:  Patch,
  DELETE: Delete,
} as const;

export function ApplyContract<C extends ContractDef<string, unknown, unknown, unknown>>(
  c: C,
): MethodDecorator {
  const HttpMethod = METHOD_DECORATORS[c.method];
  return applyDecorators(HttpMethod(c.path), SetMetadata(CONTRACT_METADATA, c));
}
