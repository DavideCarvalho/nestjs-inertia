import { Controller, Get, Param } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  list() {
    return [];
  }

  @Get(':id')
  show(@Param('id') _id: string) {
    return {};
  }
}
