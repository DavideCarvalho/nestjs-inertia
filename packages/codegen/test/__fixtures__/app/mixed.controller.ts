import 'reflect-metadata';
import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

// One route with @ApplyContract (contract route)
const ListPosts = Contract.get('/api/posts', {
  response: z.array(z.object({ id: z.string(), title: z.string() })),
  name: 'posts.list',
});

@Controller()
export class MixedController {
  @ApplyContract(ListPosts)
  list() {
    return [];
  }

  @Get('/dashboard')
  index() {
    return {};
  }
}
