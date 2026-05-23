import 'reflect-metadata';
import { ApplyContract, As, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  response: z.array(z.object({ id: z.string() })),
});

const ListOther = defineContract({
  response: z.array(z.object({ id: z.string() })),
});

@Controller()
export class CollisionController {
  @Get('/api/items')
  @ApplyContract(ListItems)
  list() {
    return [];
  }

  @Get('/api/other')
  @ApplyContract(ListOther)
  @As('collision.list') // collides with auto-derived 'collision.list' above
  other() {
    return [];
  }
}
