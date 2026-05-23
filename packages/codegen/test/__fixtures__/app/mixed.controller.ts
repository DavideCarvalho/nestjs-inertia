import 'reflect-metadata';
import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

// One route with @ApplyContract (contract route)
const ListPosts = defineContract({
  response: z.array(z.object({ id: z.string(), title: z.string() })),
});

@Controller()
export class MixedController {
  @Get('/api/posts')
  @ApplyContract(ListPosts)
  list() {
    return [];
  }

  @Get('/dashboard')
  index() {
    return {};
  }
}
