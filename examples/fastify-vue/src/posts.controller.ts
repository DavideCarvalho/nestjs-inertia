import { ApplyContract, Contract } from '@dudousxd/nestjs-inertia-client';
import { Controller } from '@nestjs/common';
import { z } from 'zod';

@Controller()
export class PostsController {
  @ApplyContract(
    Contract.get('/api/posts', {
      response: z.array(z.object({ id: z.string(), title: z.string() })),
      name: 'posts.list',
    }),
  )
  list(): Array<{ id: string; title: string }> {
    return [
      { id: '1', title: 'Hello World' },
      { id: '2', title: 'NestJS + Vue 3 with Inertia' },
    ];
  }
}
