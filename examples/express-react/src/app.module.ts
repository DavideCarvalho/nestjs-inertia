import 'reflect-metadata';
import { InertiaModule } from '@dudousxd/nestjs-inertia';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { sessionFlashStore } from './session-flash-store.js';
import { getSharedProps } from './shared-props.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [
    InertiaModule.forRoot({
      version: '1',
      rootView: 'inertia/index.html',
      share: getSharedProps,
      // Automatic validation-error handling: flash the field-keyed error bag and
      // 303-redirect back. Requires a flashStore (here express-session-backed).
      flashStore: sessionFlashStore,
      validation: { enabled: true },
    }),
  ],
  controllers: [DashboardController, UsersController, AuthController],
})
export class AppModule {}
