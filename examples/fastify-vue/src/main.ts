import 'reflect-metadata';
import { setupInertiaVite } from '@dudousxd/nestjs-inertia-vite';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await setupInertiaVite(app, {
    mode: process.env.NODE_ENV,
    root: process.cwd(),
    publicDir: 'public',
    outDir: 'dist/inertia',
  });

  await app.listen(3001);
}

void bootstrap();
