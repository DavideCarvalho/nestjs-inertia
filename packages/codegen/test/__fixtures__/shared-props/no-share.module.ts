import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      rootView: 'inertia/index.html',
      version: '1',
    }),
  ],
})
export class AppModule {}
