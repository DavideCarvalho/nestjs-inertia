import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

@Controller()
export class ItemsController {
  @Get('/api/items')
  @ApplyContract(ListItems)
  list(): Array<{ id: string; name: string }> {
    return [
      { id: '1', name: 'Widget A' },
      { id: '2', name: 'Widget B' },
    ];
  }
}
