import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: false },
  );
  await app.listen(0);
  const url = await app.getUrl();
  baseUrl = url.replace('[::1]', '127.0.0.1');
});

afterAll(async () => {
  await app.close();
});

describe('example smoke', () => {
  it('dashboard returns Inertia JSON when X-Inertia header set', async () => {
    const res = await fetch(`${baseUrl}/dashboard`, {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': '1' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.component).toBe('Dashboard');
    expect(json.props.user.name).toBe('Davi');
  });

  it('posts.list returns plain JSON', async () => {
    const res = await fetch(`${baseUrl}/api/posts`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
  });
});
