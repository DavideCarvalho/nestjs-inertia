import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Inertia, InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  @Inertia('Home')
  show() { return { hello: 'fastify' }; }
}

describe('Fastify — forRoot E2E', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ version: 'fastify-v1' })],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });

  it('returns Inertia JSON when X-Inertia: true', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'x-inertia': 'true' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      component: 'Home',
      props: { hello: 'fastify', errors: {} },
      version: 'fastify-v1',
    });
  });

  it('returns HTML shell on plain GET', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.body).toContain('<div id="app"');
  });

  it('returns 409 + X-Inertia-Location on version mismatch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-inertia': 'true', 'x-inertia-version': 'stale' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.headers['x-inertia-location']).toBe('/');
  });
});
