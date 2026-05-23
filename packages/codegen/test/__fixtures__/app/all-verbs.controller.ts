import 'reflect-metadata';
import { ApplyContract, defineContract } from '@dudousxd/nestjs-inertia-client';
import { Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';

const ListItems = defineContract({
  name: 'items.list',
  query: z.object({ page: z.number().optional() }),
  response: z.array(z.object({ id: z.string() })),
});

const CreateItem = defineContract({
  name: 'items.create',
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
});

const ReplaceItem = defineContract({
  name: 'items.replace',
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
});

const UpdateItem = defineContract({
  name: 'items.update',
  body: z.object({ name: z.string().optional() }),
  response: z.object({ id: z.string() }),
});

const DeleteItem = defineContract({
  name: 'items.delete',
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
