import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  afterAll(async () => { await app.close(); });

  it('renders the component named in @Inertia decorator', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard').set('X-Inertia', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      component: 'Dashboard',
      props: { user: { id: '42' }, stats: { runs: 7 }, errors: {} },
    });
  });

  it('still serves HTML shell on non-Inertia visit', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard');
    expect(res.headers['content-type']).toMatch(/html/);
    // data-page attribute is HTML-escaped; check for escaped form
    expect(res.text).toContain('&quot;component&quot;:&quot;Dashboard&quot;');
  });
});
