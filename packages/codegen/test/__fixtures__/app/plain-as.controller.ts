import { Body, Controller, Get, Post } from '@nestjs/common';

class ItemDto {
  id: string;
  name: string;
}

// Test class-level @As on plain (non-@ApplyContract) routes
@Controller('/api/plain-as')
@As('myPlainAlias')
export class PlainAsController {
  @Get()
  @As('listAll')
  list(): Promise<ItemDto[]> {
    return [] as any;
  }

  @Post()
  create(@Body() body: ItemDto): Promise<ItemDto> {
    return {} as any;
  }
}
