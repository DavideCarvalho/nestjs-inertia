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
    return { hello: 'ssr' };
  }
}

const origCwd = process.cwd();

describe('SSR — E2E', () => {
  let app: INestApplication;
  let bundlePath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-ssr-e2e-'));
    bundlePath = join(dir, 'ssr.mjs');
    writeFileSync(
      bundlePath,
      `
export const render = async (page) => ({
  head: ['<title>' + page.component + ' SSR</title>'],
  body: '<div id="app">SSR body for ' + page.component + '</div>',
});
`,
    );

    // Create an HTML shell with directives so SSR head/body are injected
    const subDir = join(dir, 'inertia');
    mkdirSync(subDir);
    const rootPath = join(subDir, 'root.html');
    writeFileSync(
      rootPath,
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
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
      imports: [
        InertiaModule.forRoot({
          version: 'v1',
          rootView: 'inertia/root.html',
          ssr: { enabled: true, bundlePath },
        }),
      ],
      controllers: [HomeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    process.chdir(origCwd);
  });

  it('serves HTML with SSR head and body injected', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.text).toContain('<title>Home SSR</title>');
    // The SSR mount is marked so the Inertia client hydrates rather than re-renders.
    expect(res.text).toContain('<div id="app" data-server-rendered="true">SSR body for Home</div>');
  });
});
