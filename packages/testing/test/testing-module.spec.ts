import { Inertia } from '@dudousxd/nestjs-inertia';
import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expectInertia } from '../src/expect.js';
import { InertiaTestingModule } from '../src/testing-module.js';

@Controller()
class Ctrl {
  @Get('/')
  @Inertia('Home')
  show() {
    return { hello: 'test' };
  }
}

describe('InertiaTestingModule', () => {
  let app: INestApplication;
  it('controller @Inertia decorator works end-to-end via TestingModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaTestingModule.forTest({ version: 'tm-v1' })],
      controllers: [Ctrl],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expectInertia({ status: res.status, body: res.body, headers: res.headers })
      .toRenderComponent('Home')
      .toHaveProp('hello', 'test')
      .toHaveVersion('tm-v1');
    await app.close();
  });
});
