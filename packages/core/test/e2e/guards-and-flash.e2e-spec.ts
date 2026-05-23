import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  type INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

/**
 * Inline auth guard that mirrors the 302/409 Inertia redirect pattern.
 * This is the pattern apps should implement (see docs/guides/auth-redirect).
 */
class LocalAuthGuard implements CanActivate {
  private readonly signInUrl = '/signin';

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: unknown; url?: string; headers: Record<string, string | undefined> }>();
    const res = ctx.switchToHttp().getResponse<{
      status: (n: number) => { setHeader: (k: string, v: string) => { end: () => void } };
      redirect: (code: number, url: string) => void;
      setHeader: (k: string, v: string) => unknown;
      end: () => void;
    }>();

    if (req.user) return true;

    const rawUrl = (req as unknown as { originalUrl?: string }).originalUrl ?? req.url ?? '/';
    const path = new URL(rawUrl, 'http://localhost').pathname;
    const target = path === this.signInUrl
      ? this.signInUrl
      : `${this.signInUrl}?return_to=${encodeURIComponent(path)}`;

    const isInertia = req.headers['x-inertia'] === 'true' || req.headers['x-inertia'] !== undefined;
    if (isInertia) {
      res.status(409).setHeader('X-Inertia-Location', target).end();
    } else {
      res.redirect(302, target);
    }
    return false;
  }
}

@Controller()
class HomeController {
  @Get('/')
  @Inertia('Home')
  show() {
    return {};
  }

  @Get('/protected')
  @UseGuards(new LocalAuthGuard())
  @Inertia('Protected')
  protected(@Req() _req: Request) {
    return {};
  }

  @Get('/signin')
  @Inertia('Signin')
  signin() {
    return {};
  }
}

describe('Auth + Flash + Error-Bag — E2E', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        InertiaModule.forRoot({
          version: 'v1',
          flashStore: { read: () => ({ email: 'required' }) },
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

  it('GET /protected without user → 302 to /signin?return_to=/protected', async () => {
    const res = await request(app.getHttpServer()).get('/protected').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/signin?return_to=%2Fprotected');
  });

  it('GET /protected with X-Inertia → 409 + X-Inertia-Location', async () => {
    const res = await request(app.getHttpServer()).get('/protected').set('X-Inertia', 'true');
    expect(res.status).toBe(409);
    expect(res.headers['x-inertia-location']).toBe('/signin?return_to=%2Fprotected');
  });

  it('GET / with FlashStore returns props.errors from store', async () => {
    const res = await request(app.getHttpServer()).get('/').set('X-Inertia', 'true');
    expect(res.body.props.errors).toEqual({ email: 'required' });
  });
});
