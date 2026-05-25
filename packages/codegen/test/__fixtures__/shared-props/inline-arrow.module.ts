import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: (req: any) => ({
        auth: req.user ? { id: req.user.id, name: req.user.name } : null,
        flash: {},
      }),
    }),
  ],
})
export class AppModule {}
