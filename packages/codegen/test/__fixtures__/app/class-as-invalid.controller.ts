import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract, As } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  response: z.array(z.object({ id: z.string() })),
});

// Class @As('Crew') starts with uppercase — should fail segment validation
@Controller('/api/crew')
@As('Crew')
export class InvalidClassAsController {
  @Get()
  @ApplyContract(ListItems)
  list() {
    return [];
  }
}
