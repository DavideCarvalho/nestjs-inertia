import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { DashboardController } from './dashboard.controller.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: '1',
      rootView: 'inertia/index.html',
    }),
  ],
  controllers: [DashboardController, UsersController],
})
export class AppModule {}
