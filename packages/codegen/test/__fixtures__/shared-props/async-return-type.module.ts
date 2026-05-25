import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: async (req: any): Promise<{ auth: { id: string } | null; csrfToken: string }> => ({
        auth: req.user ? { id: req.user.id } : null,
        csrfToken: req.csrfToken(),
      }),
    }),
  ],
})
export class AppModule {}
