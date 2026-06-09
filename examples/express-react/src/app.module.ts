import 'reflect-metadata';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { getSharedProps } from './shared-props.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: '1',
      rootView: 'inertia/index.html',
      share: getSharedProps,
    }),
  ],
  controllers: [DashboardController, UsersController],
})
export class AppModule {}
