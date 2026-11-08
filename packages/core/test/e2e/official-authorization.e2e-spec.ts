import { AuthorizationModule, Can, Policy } from '@nestjs/authorization';
import {
  type ArgumentsHost,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  type INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Inertia, InertiaModule } from '../../src/index.js';

/**
 * The library under the official, deny-by-default `@nestjs/authorization` guard.
 *
 * nestjs-inertia mounts no controller of its own: it works through middleware (Inertia
 * request parsing, method spoofing), interceptors (render, asset-version 409, redirects)
 * and an exception filter. So there is nothing of the library's for the global
 * `AuthorizationGuard` to refuse: the guard only decides the app's own page routes. These tests pin that down,
 * and record what an Inertia page request the guard denies looks like.
 */

interface User {
  id: string;
  admin: boolean;
}

@Policy()
@Injectable()
class DashboardPolicy {
  view(user: User | null): boolean {
    return user?.admin === true;
  }
}

@Controller()
class PagesController {
  @Get('/')
  @Can.Anyone()
  @Inertia('Home')
  home() {
    return { greeting: 'hi' };
  }

  @Get('/dashboard')
  @Can(DashboardPolicy, 'view')
  @Inertia('Dashboard')
  dashboard() {
    return {};
  }

  /** Declares nothing: the official guard refuses it. */
  @Get('/forgotten')
  @Inertia('Forgotten')
  forgotten() {
    return {};
  }
}

@Module({ providers: [DashboardPolicy], controllers: [PagesController] })
class PagesModule {}

/** The app-side mapping from the docs recipe (website/.../recipes/official-authorization.mdx). */
@Catch(UnauthorizedException)
class SignInRedirectFilter implements ExceptionFilter {
  catch(_exception: UnauthorizedException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const target = `/signin?return_to=${encodeURIComponent(req.originalUrl)}`;
    if (req.headers['x-inertia']) {
      res.status(409).setHeader('X-Inertia-Location', target).end();
    } else {
      res.redirect(302, target);
    }
  }
}

async function createApp(extraProviders: unknown[] = []): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      InertiaModule.forRoot({ version: 'v1', codegen: { enabled: false } }),
      // Global APP_GUARD, deny by default.
      AuthorizationModule.forRoot(),
      PagesModule,
    ],
    providers: extraProviders as never[],
  }).compile();
  const app = moduleRef.createNestApplication();
  // Stand-in for an authentication layer: `x-user: admin|member` sets `request.user`.
  app.use(
    (req: { headers: Record<string, string>; user?: User }, _res: unknown, next: () => void) => {
      const role = req.headers['x-user'];
      if (role) req.user = { id: role, admin: role === 'admin' };
      next();
    },
  );
  await app.init();
  return app;
}

describe('nestjs-inertia under the official @nestjs/authorization guard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('an open page renders as an Inertia page (HTML and JSON)', async () => {
    const html = await request(app.getHttpServer()).get('/');
    expect(html.status).toBe(200);
    expect(html.text).toContain('data-page');

    const json = await request(app.getHttpServer())
      .get('/')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'v1');
    expect(json.status).toBe(200);
    expect(json.body.component).toBe('Home');
  });

  it('the asset-version check still answers on an open page: stale version → 409', async () => {
    // The check runs at render time, after guards: a refused route answers 401/403 first.
    const res = await request(app.getHttpServer())
      .get('/')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'stale');
    expect(res.status).toBe(409);
    expect(res.headers['x-inertia-location']).toBeDefined();
  });

  it('a page that declares no requirement is refused (deny by default)', async () => {
    const res = await request(app.getHttpServer()).get('/forgotten');
    expect(res.status).toBe(401);
  });

  it('the policy decides: admin allowed, member 403', async () => {
    const ok = await request(app.getHttpServer())
      .get('/dashboard')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'v1')
      .set('x-user', 'admin');
    expect(ok.status).toBe(200);
    expect(ok.body.component).toBe('Dashboard');

    const denied = await request(app.getHttpServer())
      .get('/dashboard')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'v1')
      .set('x-user', 'member');
    expect(denied.status).toBe(403);
  });

  // Observation: a denial is Nest's plain JSON exception body for BOTH a full page load and
  // an Inertia XHR visit. No HTML shell, no X-Inertia header, no redirect to a login page —
  // the Inertia client shows it in its "non-Inertia response" dialog. Mapping it (e.g. 401 →
  // redirect to login) is left to the app's own exception filter, see docs/recipes/auth-redirect.
  it('a denied page request is answered with JSON, not an Inertia page', async () => {
    const guestPage = await request(app.getHttpServer()).get('/dashboard');
    expect(guestPage.status).toBe(401);
    expect(guestPage.headers['content-type']).toMatch(/application\/json/);
    expect(guestPage.body).toEqual({ message: 'Unauthorized', statusCode: 401 });

    const guestVisit = await request(app.getHttpServer())
      .get('/dashboard')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'v1');
    expect(guestVisit.status).toBe(401);
    expect(guestVisit.headers['x-inertia']).toBeUndefined();
    expect(guestVisit.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
  });
});

describe('mapping a 401 to the sign-in page with an app filter (docs recipe)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp([{ provide: APP_FILTER, useClass: SignInRedirectFilter }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('page load → 302 to sign-in; Inertia visit → 409 + X-Inertia-Location', async () => {
    const page = await request(app.getHttpServer()).get('/dashboard').redirects(0);
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/signin?return_to=%2Fdashboard');

    const visit = await request(app.getHttpServer())
      .get('/dashboard')
      .set('X-Inertia', 'true')
      .set('X-Inertia-Version', 'v1');
    expect(visit.status).toBe(409);
    expect(visit.headers['x-inertia-location']).toBe('/signin?return_to=%2Fdashboard');
  });

  it('a 403 is left alone', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard').set('x-user', 'member');
    expect(res.status).toBe(403);
  });
});
