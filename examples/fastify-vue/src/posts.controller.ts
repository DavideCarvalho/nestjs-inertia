import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListPosts = defineContract({
  response: z.array(z.object({ id: z.string(), title: z.string() })),
});

@Controller()
export class PostsController {
  @Get('/api/posts')
  @ApplyContract(ListPosts)
  list(): Array<{ id: string; title: string }> {
    return [
      { id: '1', title: 'Hello World' },
      { id: '2', title: 'NestJS + Vue 3 with Inertia' },
    ];
  }
}
