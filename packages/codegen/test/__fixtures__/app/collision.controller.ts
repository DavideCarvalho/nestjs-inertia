import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract, As } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  response: z.array(z.object({ id: z.string() })),
});

const ListOther = defineContract({
  response: z.array(z.object({ id: z.string() })),
});

// Both methods resolve to 'collision.list':
//   list()  → class derived 'collision' + method name 'list'     = 'collision.list'
//   other() → class derived 'collision' + method @As('list')     = 'collision.list'  ← collision
@Controller()
export class CollisionController {
  @Get('/api/items')
  @ApplyContract(ListItems)
  list() {
    return [];
  }

  @Get('/api/other')
  @ApplyContract(ListOther)
  @As('list') // collides with auto-derived 'collision.list' above
  other() {
    return [];
  }
}
