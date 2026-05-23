import { Controller, Get, type INestApplication, Injectable, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InertiaModule } from '../../src/index.js';

@Injectable()
class AppConfig {
  readonly version = 'e2e-v1';
}

@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
class AppConfigModule {}

@Controller()
class HomeController {
  @Get('/')
  async show(@Req() req: Request): Promise<void> {
    await req.inertia.render('Home', { hello: 'async' });
  }
}

describe('InertiaModule.forRootAsync — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRootAsync({
          imports: [AppConfigModule],
          inject: [AppConfig],
          useFactory: (cfg: AppConfig) => ({ version: cfg.version }),
        }),
      ],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves Inertia JSON with version from async factory', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      component: 'Home',
      props: { hello: 'async', errors: {} },
      version: 'e2e-v1',
    });
  });
});
