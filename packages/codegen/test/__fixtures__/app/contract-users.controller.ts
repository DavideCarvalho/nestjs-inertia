import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListUsers = defineContract({
  query: z.object({ active: z.boolean().optional() }),
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

@Controller()
export class ContractUsersController {
  @Get('/api/users')
  @ApplyContract(ListUsers)
  list() {
    return [];
  }
}

// touched
