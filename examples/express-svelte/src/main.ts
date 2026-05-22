import 'reflect-metadata';
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  await setupInertiaVite(app, {
    mode: process.env.NODE_ENV,
    root: process.cwd(),
    publicDir: 'public',
    outDir: 'dist/inertia',
  });

  await app.listen(3002);
}

void bootstrap();
