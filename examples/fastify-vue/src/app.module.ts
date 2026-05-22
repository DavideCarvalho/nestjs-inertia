import 'reflect-metadata';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { PostsController } from './posts.controller.js';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: '1',
      rootView: 'inertia/index.html',
    }),
  ],
  controllers: [DashboardController, PostsController],
})
export class AppModule {}
