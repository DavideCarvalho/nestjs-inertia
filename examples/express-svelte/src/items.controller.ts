import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { Controller } from '@nestjs/common';
import { z } from 'zod';

@Controller()
export class ItemsController {
  @ApplyContract(
    Contract.get('/api/items', {
      response: z.array(z.object({ id: z.string(), name: z.string() })),
      name: 'items.list',
    }),
  )
  list(): Array<{ id: string; name: string }> {
    return [
      { id: '1', name: 'Widget A' },
      { id: '2', name: 'Widget B' },
    ];
  }
}
