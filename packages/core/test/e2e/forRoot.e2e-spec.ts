import { Controller, Get, HttpCode, type INestApplication, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  async show(@Req() req: Request): Promise<void> {
    await req.inertia.render('Home', { hello: 'world' });
  }

  @Post('/form')
  @HttpCode(200)
  async submit(@Req() req: Request): Promise<void> {
    await req.inertia.render('FormResult', { ok: true });
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

  it('returns HTML shell without X-Inertia header (v3: script#inertia-page)', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<div id="app">');
    expect(res.text).toContain('<script id="inertia-page" type="application/json">');
    expect(res.text).not.toContain('data-page=');
  });

  it('runs middleware on POST requests (req.inertia must be defined)', async () => {
    const res = await request(app.getHttpServer())
      .post('/form')
      .set('X-Inertia', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ component: 'FormResult', props: { ok: true, errors: {} } });
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
