import 'reflect-metadata';
import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { Controller } from '@nestjs/common';
import { z } from 'zod';

@Controller()
export class InlineContractController {
  @ApplyContract(
    Contract.get('/api/foo', {
      response: z.array(z.object({ id: z.string() })),
      name: 'foo.list',
    }),
  )
  list() {
    return [];
  }
}
