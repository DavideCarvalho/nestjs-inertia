import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    InertiaModule.forRoot({
      share: (
        req: any,
      ): { auth: { id: string; name: string } | null; flash: Record<string, string> } => ({
        auth: req.user ? { id: req.user.id, name: req.user.name } : null,
        flash: req.flash ?? {},
      }),
    }),
  ],
})
export class AppModule {}
