import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract, As } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListCrew = defineContract({
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

// Class-level @As('crew') sets the class portion.
// Method-level @As('directory.fetch') sets the method portion.
// Composed result: 'crew.directory.fetch'
@Controller('/api/crew')
@As('crew')
export class CrewController {
  @Get()
  @ApplyContract(ListCrew)
  @As('directory.fetch')
  list() {
    return [];
  }
}
