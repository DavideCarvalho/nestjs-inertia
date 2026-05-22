import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { ContractUsersController } from './contract-users.controller.js';

@Module({ controllers: [UsersController, ContractUsersController] })
export class AppModule {}
