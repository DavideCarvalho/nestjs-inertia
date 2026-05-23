import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CanActivate, Controller, type ExecutionContext, Get, Put, Res, UseGuards } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

/**
 * Inline auth guard implementing the 302/409 Inertia redirect pattern for Fastify.
 */
class LocalFastifyAuthGuard implements CanActivate {
  private readonly signInUrl = '/signin';

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: unknown; url?: string; headers: Record<string, string | undefined> }>();
    const res = ctx.switchToHttp().getResponse<{
      code: (n: number) => unknown;
      header: (k: string, v: string) => unknown;
      send: (body: string) => void;
      redirect: (url: string, code: number) => void;
    }>();

    if (req.user) return true;

    const rawUrl = (req as unknown as { raw?: { originalUrl?: string; url?: string } }).raw?.originalUrl
      ?? (req as unknown as { raw?: { url?: string } }).raw?.url
      ?? req.url ?? '/';
    const path = new URL(rawUrl, 'http://localhost').pathname;
    const target = path === this.signInUrl
      ? this.signInUrl
      : `${this.signInUrl}?return_to=${encodeURIComponent(path)}`;

    const isInertia = req.headers['x-inertia'] !== undefined;
    if (isInertia) {
      (res as unknown as { code: (n: number) => { header: (k: string, v: string) => { send: (b: string) => void } } })
        .code(409).header('X-Inertia-Location', target).send('');
    } else {
      res.redirect(target, 302);
    }
    return false;
  }
}

@Controller()
class TestController {
  @Get('/')
  @Inertia('Home')
  show() {
    return { hello: 'fastify' };
  }

  @Put('/items/:id')
  async update(@Res() reply: FastifyReply) {
    return reply.code(302).header('location', '/items').send('');
  }

  @Get('/protected')
  @UseGuards(new LocalFastifyAuthGuard())
  @Inertia('Protected')
  protected() {
    return {};
  }
}

const origCwd = process.cwd();

describe('Fastify parity — E2E', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestjs-inertia-fastify-parity-'));
    const sub = join(dir, 'inertia');
    mkdirSync(sub);
    writeFileSync(
      join(sub, 'root.html'),
      `<!doctype html>
<html><head>@inertiaHead</head><body>@inertia</body></html>`,
    );
    process.chdir(dir);

    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({
          version: 'v1',
          rootView: 'inertia/root.html',
          flashStore: { read: () => ({ field: 'required' }) },
        }),
      ],
      controllers: [TestController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
    process.chdir(origCwd);
  });

  it('@Inertia decorator works on Fastify', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'x-inertia': 'true' } });
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      component: 'Home',
      props: expect.objectContaining({ hello: 'fastify' }),
    });
  });

  it('shell directives render correctly on Fastify', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.body).toContain('<!doctype html>');
    expect(res.body).toContain('<div id="app"');
  });

  it('PUT redirect 302 → 303 on Fastify Inertia request', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/items/1',
      headers: { 'x-inertia': 'true' },
    });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/items');
  });

  it('auth guard returns 302 on plain visit to protected', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/signin?return_to=%2Fprotected');
  });

  it('auth guard returns 409 + X-Inertia-Location on Inertia XHR to protected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-inertia': 'true' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.headers['x-inertia-location']).toBe('/signin?return_to=%2Fprotected');
  });

  it('FlashStore errors land in props.errors on Fastify', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'x-inertia': 'true' } });
    const body = JSON.parse(res.body);
    expect(body.props.errors).toEqual({ field: 'required' });
  });
});
