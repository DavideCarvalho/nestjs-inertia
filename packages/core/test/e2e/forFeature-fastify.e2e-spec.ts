import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Inertia, InertiaModule, UseInertia } from '../../src/index.js';

@Controller('admin')
@UseInertia('admin')
class AdminController {
  @Get('/')
  @Inertia('AdminHome')
  show() { return { area: 'admin' }; }
}

@Controller()
class MainController {
  @Get('/')
  @Inertia('Main')
  show() { return { area: 'main' }; }
}

describe('forFeature + Fastify — E2E', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({ version: 'main-v1' }),
        InertiaModule.forFeature({ scope: 'admin', version: 'admin-v1' }),
      ],
      controllers: [MainController, AdminController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });

  it('main scope on Fastify renders Main with main-v1', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'x-inertia': 'true' } });
    const body = JSON.parse(res.body);
    expect(body.component).toBe('Main');
    expect(body.version).toBe('main-v1');
  });

  it('admin scope on Fastify renders AdminHome with admin-v1', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin', headers: { 'x-inertia': 'true' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.component).toBe('AdminHome');
    expect(body.version).toBe('admin-v1');
    expect(body.props.area).toBe('admin');
  });
});
