import 'reflect-metadata';
import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

@Controller()
export class InlineContractController {
  @Get('/api/foo')
  @ApplyContract(
    defineContract({
      name: 'foo.list',
      response: z.array(z.object({ id: z.string() })),
    }),
  )
  list() {
    return [];
  }
}
