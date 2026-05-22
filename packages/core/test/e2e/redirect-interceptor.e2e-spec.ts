import { Controller, type INestApplication, Put, Res } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InertiaModule } from '../../src/index.js';

@Controller()
class FormController {
  @Put('/items/:id')
  async update(@Res() res: Response) {
    return res.redirect(302, '/items');
  }
}

describe('RedirectInterceptor — E2E', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({})],
      controllers: [FormController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('PUT redirect 302 is upgraded to 303 when X-Inertia header present', async () => {
    const res = await request(app.getHttpServer())
      .put('/items/1')
      .set('X-Inertia', 'true')
      .redirects(0);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/items');
  });

  it('PUT redirect 302 stays 302 when X-Inertia header absent', async () => {
    const res = await request(app.getHttpServer())
      .put('/items/1')
      .redirects(0);
    expect(res.status).toBe(302);
  });
});
