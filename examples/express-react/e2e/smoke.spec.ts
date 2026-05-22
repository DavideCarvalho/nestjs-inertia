import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  const server = app.getHttpServer();
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
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
  it('users.list returns plain JSON', async () => {
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
  });
});
