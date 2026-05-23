import 'reflect-metadata';
import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListUsers = defineContract({
  query: z.object({ active: z.boolean().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

@Controller()
export class ContractUsersController {
  @Get('/api/users')
  @ApplyContract(ListUsers)
  list() {
    return [];
  }
}
