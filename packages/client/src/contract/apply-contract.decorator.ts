import {
  Delete,
  Get,
  Patch,
  Post,
  Put,
  SetMetadata,
  UsePipes,
  applyDecorators,
} from '@nestjs/common';
import { ContractValidationPipe } from './contract-validation.pipe.js';
import type { ContractDef } from './contract.js';
import { CONTRACT_METADATA } from './metadata.js';

type HttpMethodKey = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const METHOD_DECORATORS: Record<HttpMethodKey, (path: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
} as const;

export interface ApplyContractOptions {
  /**
   * When `true`, validates incoming `body` and `query` against the Contract's
   * Zod schemas at runtime using a NestJS pipe.
   *
   * On validation failure a `BadRequestException` is thrown with the Zod
   * issues serialized in the response body:
   * `{ message: 'Contract validation failed', issues: ZodIssue[] }`.
   *
   * **Default: `false`** — schemas are read at codegen-time only, and no
   * runtime validation is performed. This matches the behaviour prior to
   * v0.9 and avoids breaking existing apps. Enable explicitly to enforce
   * the contract at runtime.
   */
  validate?: boolean;
}

export function ApplyContract<C extends ContractDef<string, unknown, unknown, unknown>>(
  c: C,
  opts: ApplyContractOptions = {},
): MethodDecorator {
  const HttpMethod = METHOD_DECORATORS[c.method];
  const decorators: (MethodDecorator | ClassDecorator | PropertyDecorator)[] = [
    HttpMethod(c.path),
    SetMetadata(CONTRACT_METADATA, c),
  ];

  if (opts.validate) {
    decorators.push(UsePipes(new ContractValidationPipe(c)));
  }

  return applyDecorators(...decorators);
}
