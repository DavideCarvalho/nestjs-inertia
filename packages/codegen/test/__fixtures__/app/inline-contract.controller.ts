import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

@Controller()
export class InlineContractController {
  @Get('/api/foo')
  @ApplyContract(
    defineContract({
      response: z.array(z.object({ id: z.string() })),
    }),
  )
  list() {
    return [];
  }
}
