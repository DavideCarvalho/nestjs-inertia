import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: {
        appName: 'My App',
        version: '1.0.0',
      },
    }),
  ],
})
export class AppModule {}
