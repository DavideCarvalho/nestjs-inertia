/* v8 ignore next 5 -- import resolution is not a branch */
import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { ContractDef } from './contract.js';

/**
 * NestJS pipe that validates incoming `body` and `query` against the
 * Contract's Zod schemas at runtime. Installed automatically when
 * `@ApplyContract(c, { validate: true })` is used.
 *
 * On validation failure throws a `BadRequestException` whose response body
 * contains `{ message: 'Contract validation failed', issues: ZodIssue[] }`.
 */
@Injectable()
export class ContractValidationPipe<C extends ContractDef> implements PipeTransform {
  constructor(private readonly contract: C) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    let schema:
      | {
          safeParse: (v: unknown) => {
            success: boolean;
            data: unknown;
            error: { issues: unknown[] };
          };
        }
      | undefined;

    if (metadata.type === 'body' && this.contract.body) {
      schema = this.contract.body as typeof schema;
    } else if (metadata.type === 'query' && this.contract.query) {
      schema = this.contract.query as typeof schema;
    } else {
      // Unhandled type — pass through unchanged
      return value;
    }

    // schema is always defined here because we checked above
    const parsed = schema!.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Contract validation failed',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
