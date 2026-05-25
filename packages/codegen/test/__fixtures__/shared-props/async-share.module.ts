import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: async (req: any) => ({
        auth: req.user ? { id: req.user.id, name: req.user.name } : null,
        notifications: [],
        flash: {},
      }),
    }),
  ],
})
export class AppModule {}
