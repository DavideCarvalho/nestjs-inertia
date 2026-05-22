import { Module } from '@nestjs/common';
import { ContractUsersController } from './contract-users.controller.js';
import { UsersController } from './users.controller.js';

@Module({ controllers: [UsersController, ContractUsersController] })
export class AppModule {}
