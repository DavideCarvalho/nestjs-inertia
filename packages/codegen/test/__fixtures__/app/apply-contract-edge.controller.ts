import 'reflect-metadata';
import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';

// Contract with both query and body
const CreateItemContract = defineContract({
  query: z.object({ format: z.string().optional() }),
  body: z.object({ name: z.string(), value: z.number() }),
  response: z.object({ id: z.string(), name: z.string() }),
});

@Controller('/api/edge')
export class ApplyContractEdgeController {
  @Post()
  @ApplyContract(CreateItemContract)
  create() {
    return {};
  }
}
