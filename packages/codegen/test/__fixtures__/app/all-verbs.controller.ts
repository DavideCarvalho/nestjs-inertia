import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  query: z.object({ page: z.number().optional() }),
  response: z.array(z.object({ id: z.string() })),
});

const CreateItem = defineContract({
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
});

const ReplaceItem = defineContract({
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
});

const UpdateItem = defineContract({
  body: z.object({ name: z.string().optional() }),
  response: z.object({ id: z.string() }),
});

const DeleteItem = defineContract({
  response: z.object({ ok: z.boolean() }),
});

@Controller('/api/items')
export class AllVerbsController {
  @Get()
  @ApplyContract(ListItems)
  list() {
    return [];
  }

  @Post()
  @ApplyContract(CreateItem)
  create() {
    return {};
  }

  @Put(':id')
  @ApplyContract(ReplaceItem)
  replace() {
    return {};
  }

  @Patch(':id')
  @ApplyContract(UpdateItem)
  update() {
    return {};
  }

  @Delete(':id')
  @ApplyContract(DeleteItem)
  remove() {
    return {};
  }
}
