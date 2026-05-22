import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, HttpCode, INestApplication, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import request from 'supertest';
import { CsrfCookieInterceptor, CsrfGuard, InertiaModule } from '../../src/index.js';

@Controller()
@UseInterceptors(new CsrfCookieInterceptor({ secret: 'test-secret' }))
class CsrfController {
  @Get('/')
  show() { return { ok: true }; }

  @Post('/profile')
  @HttpCode(200)
  @UseGuards(new CsrfGuard({ secret: 'test-secret' }))
  update() { return { saved: true }; }
}

describe('CSRF — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({})],
      controllers: [CsrfController],
    }).compile();
    app = moduleRef.createNestApplication();
    const cookieParser = (await import('cookie-parser')).default;
    app.use(cookieParser());
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET / writes XSRF-TOKEN cookie', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toMatch(/XSRF-TOKEN=/);
  });

  it('POST without header → 403 (InvalidCsrfTokenException)', async () => {
    const getRes = await request(app.getHttpServer()).get('/');
    const cookie = getRes.headers['set-cookie'][0].split(';')[0];
    const res = await request(app.getHttpServer())
      .post('/profile')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('POST with matching header → 200 (success)', async () => {
    const getRes = await request(app.getHttpServer()).get('/');
    const setCookieHeader = getRes.headers['set-cookie'][0];
    const tokenMatch = setCookieHeader.match(/XSRF-TOKEN=([^;]+)/);
    expect(tokenMatch).not.toBeNull();
    const token = decodeURIComponent(tokenMatch![1]!);
    const cookieHeader = setCookieHeader.split(';')[0];
    const res = await request(app.getHttpServer())
      .post('/profile')
      .set('Cookie', cookieHeader)
      .set('X-XSRF-TOKEN', token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true });
  });
});
