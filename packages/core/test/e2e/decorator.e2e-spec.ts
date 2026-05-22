import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

@Controller()
class DashboardController {
  @Get('/dashboard')
  @Inertia('Dashboard')
  show() {
    return { user: { id: '42' }, stats: { runs: 7 } };
  }
}

describe('@Inertia decorator — E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ version: 'v-test' })],
      controllers: [DashboardController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders the component named in @Inertia decorator', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard').set('X-Inertia', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      component: 'Dashboard',
      props: { user: { id: '42' }, stats: { runs: 7 }, errors: {} },
    });
  });

  it('still serves HTML shell on non-Inertia visit (v3: JSON script tag, unescaped)', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard');
    expect(res.headers['content-type']).toMatch(/html/);
    // v3: page data is in a JSON script tag (not an HTML attribute), so no HTML escaping
    expect(res.text).toContain('<script id="inertia-page" type="application/json">');
    expect(res.text).toContain('"component":"Dashboard"');
  });
});
