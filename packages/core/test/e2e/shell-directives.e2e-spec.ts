import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

@Controller()
class HomeController {
  @Get('/')
  @Inertia('Home')
  show() {
    return { hello: 'world' };
  }
}

const origCwd = process.cwd();

describe('Shell directives — E2E with file-based rootView', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-shell-e2e-'));
    const sub = join(dir, 'inertia');
    mkdirSync(sub);
    const rootPath = join(sub, 'root.html');
    writeFileSync(
      rootPath,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>E2E Test</title>
  @inertiaHead
</head>
<body>
  @inertia
</body>
</html>
`,
    );
    process.chdir(dir);

    const moduleRef = await Test.createTestingModule({
      imports: [InertiaModule.forRoot({ rootView: 'inertia/root.html', version: 'v1' })],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.chdir(origCwd);
  });

  it('serves HTML with @inertia expanded to <div id="app"> + <script data-page="app"> (v3)', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<!doctype html>');
    expect(res.text).toContain('<title>E2E Test</title>');
    expect(res.text).toContain('<div id="app">');
    expect(res.text).toContain('<script data-page="app" type="application/json">');
    expect(res.text).toContain('"component":"Home"');
  });

  it('serves Inertia JSON when X-Inertia: true (file rootView not used)', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.body).toMatchObject({ component: 'Home', props: { hello: 'world' } });
  });
});
