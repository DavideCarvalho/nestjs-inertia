import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import request from 'supertest';
import { InertiaAuthGuard, Inertia, InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  @Inertia('Home')
  show() { return {}; }

  @Get('/protected')
  @UseGuards(new InertiaAuthGuard({ signInUrl: '/signin', allowList: [] }))
  @Inertia('Protected')
  protected(@Req() _req: Request) { return {}; }

  @Get('/signin')
  @Inertia('Signin')
  signin() { return {}; }
}

describe('Auth + Flash + Error-Bag — E2E', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({
          version: 'v1',
          flashStore: { read: () => ({ email: 'required' }) },
        }),
      ],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('GET /protected without user → 302 to /signin?return_to=/protected', async () => {
    const res = await request(app.getHttpServer()).get('/protected').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/signin?return_to=%2Fprotected');
  });

  it('GET /protected with X-Inertia → 409 + X-Inertia-Location', async () => {
    const res = await request(app.getHttpServer()).get('/protected').set('X-Inertia', 'true');
    expect(res.status).toBe(409);
    expect(res.headers['x-inertia-location']).toBe('/signin?return_to=%2Fprotected');
  });

  it('GET / with FlashStore returns props.errors from store', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.body.props.errors).toEqual({ email: 'required' });
  });
});
