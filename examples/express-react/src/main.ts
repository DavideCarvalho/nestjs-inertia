import 'reflect-metadata';
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Session backs the flash store used by InertiaValidationFilter to carry the
  // error bag across the validation redirect-back.
  app.use(
    session({
      secret: 'example-secret-change-me',
      resave: false,
      saveUninitialized: false,
    }),
  );

  await setupInertiaVite(app, {
    mode: process.env.NODE_ENV,
    root: process.cwd(),
    publicDir: 'public',
    outDir: 'dist/inertia',
  });

  await app.listen(3000);
}

void bootstrap();
