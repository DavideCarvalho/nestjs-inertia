import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListUsers = defineContract({
  query: z.object({ active: z.boolean().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

@Controller()
export class UsersController {
  @Get('/api/users')
  @ApplyContract(ListUsers)
  list(): Array<{ id: string; name: string }> {
    return [
      { id: '1', name: 'Davi' },
      { id: '2', name: 'Romi' },
    ];
  }
}
