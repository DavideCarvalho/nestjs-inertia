import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  @Inertia('Home')
  show() {
    return {};
  }
}

const origCwd = process.cwd();

async function setupApp(ext: string, templateSource: string): Promise<INestApplication> {
  const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-engine-'));
  const sub = join(dir, 'inertia');
  mkdirSync(sub);
  writeFileSync(join(sub, `root.${ext}`), templateSource);
  process.chdir(dir);
  const moduleRef = await Test.createTestingModule({
    imports: [InertiaModule.forRoot({ rootView: `inertia/root.${ext}`, version: 'v1' })],
    controllers: [HomeController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Template engines — E2E', () => {
  afterAll(() => process.chdir(origCwd));

  it('Handlebars works end-to-end', async () => {
    const app = await setupApp('hbs', '<!doctype html><html><body>{{{inertia}}}</body></html>');
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<div id="app">');
    expect(res.text).toContain('<script id="inertia-page" type="application/json">');
    await app.close();
  });

  it('EJS works end-to-end', async () => {
    const app = await setupApp('ejs', '<!doctype html><html><body><%- inertia %></body></html>');
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<div id="app"');
    await app.close();
  });

  it('Pug works end-to-end', async () => {
    const app = await setupApp('pug', 'html\n  body!= inertia');
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<div id="app"');
    await app.close();
  });

  it('Liquid works end-to-end (uses @inertia directive)', async () => {
    const app = await setupApp('liquid', '<!doctype html><body>@inertia</body>');
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<div id="app"');
    await app.close();
  });
});
