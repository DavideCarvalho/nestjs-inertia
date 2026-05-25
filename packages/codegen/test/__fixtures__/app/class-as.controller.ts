import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract, As } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Get } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  response: z.array(z.object({ id: z.string(), name: z.string() })),
});

// ── Case 1: class @As('crew') + method auto → 'crew.list' ──────────────────
@Controller('/api/crew')
@As('crew')
export class CrewClassAsController {
  @Get()
  @ApplyContract(ListItems)
  list() {
    return [];
  }
}

// ── Case 2: class auto + method @As('top10') ────────────────────────────────
// Class name: CrewMemberController → derived class segment: crewMember
// Result: 'crewMember.top10'
@Controller('/api/crew-member')
export class CrewMemberController {
  @Get()
  @ApplyContract(ListItems)
  @As('top10')
  list() {
    return [];
  }
}

// ── Case 3: class @As('crew') + method @As('directory.fetch') ───────────────
// Result: 'crew.directory.fetch'
@Controller('/api/crew2')
@As('crew')
export class CrewTwoController {
  @Get()
  @ApplyContract(ListItems)
  @As('directory.fetch')
  fetch() {
    return [];
  }
}

// ── Case 4: class @As('crew.admin') (multi-segment) + method @As('top10') ───
// Result: 'crew.admin.top10'
@Controller('/api/crew-admin')
@As('crew.admin')
export class CrewAdminController {
  @Get()
  @ApplyContract(ListItems)
  @As('top10')
  list() {
    return [];
  }
}

// ── Case 5: both absent → default derivation ────────────────────────────────
// Class name: CrewDefaultController → derived class segment: crewDefault
// Method: list → 'crewDefault.list'
@Controller('/api/crew-default')
export class CrewDefaultController {
  @Get()
  @ApplyContract(ListItems)
  list() {
    return [];
  }
}
