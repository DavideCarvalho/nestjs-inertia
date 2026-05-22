import { Controller } from '@nestjs/common';
import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { z } from 'zod';

const ListUsers = Contract.get('/api/users', {
  query: z.object({ active: z.boolean().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
  name: 'users.list',
});

@Controller()
export class UsersController {
  @ApplyContract(ListUsers)
  list(): Array<{ id: string; name: string }> {
    return [
      { id: '1', name: 'Davi' },
      { id: '2', name: 'Romi' },
    ];
  }
}
