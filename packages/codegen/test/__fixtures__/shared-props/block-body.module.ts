import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: (req: any) => {
        const user = req.user;
        return {
          auth: user ? { id: user.id, name: user.name } : null,
          locale: 'en',
          flash: {},
        };
      },
    }),
  ],
})
export class AppModule {}
