import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Inertia, InertiaModule, UseInertia } from '../../src/index.js';

@Controller('admin')
@UseInertia('admin')
class AdminController {
  @Get('/')
  @Inertia('AdminHome')
  show() { return { area: 'admin' }; }
}

@Controller('portal')
@UseInertia('portal')
class PortalController {
  @Get('/')
  @Inertia('PortalHome')
  show() { return { area: 'portal' }; }
}

@Controller()
class MainController {
  @Get('/')
  @Inertia('Main')
  show() { return { area: 'main' }; }
}

describe('forFeature multi-app — E2E', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({ version: 'main-v1' }),
        InertiaModule.forFeature({ scope: 'admin', version: 'admin-v1' }),
        InertiaModule.forFeature({ scope: 'portal', version: 'portal-v1' }),
      ],
      controllers: [MainController, AdminController, PortalController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('main scope uses main-v1', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.body.version).toBe('main-v1');
    expect(res.body.component).toBe('Main');
  });

  it('admin scope uses admin-v1 and renders AdminHome', async () => {
    const res = await request(app.getHttpServer()).get('/admin').set('X-Inertia', 'true');
    expect(res.body.version).toBe('admin-v1');
    expect(res.body.component).toBe('AdminHome');
    expect(res.body.props.area).toBe('admin');
  });

  it('portal scope uses portal-v1 and renders PortalHome', async () => {
    const res = await request(app.getHttpServer()).get('/portal').set('X-Inertia', 'true');
    expect(res.body.version).toBe('portal-v1');
    expect(res.body.component).toBe('PortalHome');
  });
});
