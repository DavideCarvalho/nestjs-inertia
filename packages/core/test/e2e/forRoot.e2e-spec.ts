import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import type { Request } from 'express';
import request from 'supertest';
import { InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  async show(@Req() req: Request): Promise<void> {
    await req.inertia.render('Home', { hello: 'world' });
  }
}

describe('InertiaModule.forRoot — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ version: 'v-test' })],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('returns Inertia JSON when X-Inertia: true', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.status).toBe(200);
    expect(res.headers['x-inertia']).toBe('true');
    expect(res.body).toMatchObject({
      component: 'Home',
      props: { hello: 'world', errors: {} },
      url: '/',
      version: 'v-test',
    });
  });

  it('returns HTML shell without X-Inertia header', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<div id="app"');
    expect(res.text).toContain('data-page=');
  });

  it('returns 409 + X-Inertia-Location on version mismatch (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'stale');
    expect(res.status).toBe(409);
    expect(res.headers['x-inertia-location']).toBe('/');
  });
});
