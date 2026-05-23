import 'reflect-metadata';
import { ApplyContract, As, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListCrew = defineContract({
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

@Controller('/api/crew')
export class CrewController {
  @Get()
  @ApplyContract(ListCrew)
  // Override auto-derived 'crew.list' with a custom name via @As
  @As('crew.directory.fetch')
  list() {
    return [];
  }
}
