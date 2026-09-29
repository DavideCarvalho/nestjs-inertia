import { BadRequestException, Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashStore } from '../../src/flash/flash-store.js';
import { InertiaModule } from '../../src/index.js';
import type { InertiaModuleOptions } from '../../src/types.js';

/**
 * Regression: Nest does not await exception filters (`ExceptionsHandler`
 * calls `filter.catch()` and drops the returned value). The validation filter
 * used to `throw exception` from an `async catch()` whenever it did not apply,
 * which turned EVERY 400 (including plain JSON API routes, and with validation
 * disabled — the filter is always registered) into an unhandled rejection that
 * crashed the process and left the request hanging.
 */
@Controller()
class ProbeController {
  @Post('/api/thing')
  api(@Body() _body: unknown) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: [{ path: ['email'], message: 'Required' }],
    });
  }

  @Post('/api/plain')
  plain() {
    throw new BadRequestException('plain message');
  }

  @Post('/form')
  form() {
    throw new BadRequestException({ __inertiaErrors: { email: 'required' } });
  }
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
});

afterEach(async () => {
  // Give any stray rejection a chance to surface before asserting.
  await new Promise((r) => setTimeout(r, 20));
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
});

type Platform = 'express' | 'fastify';

async function createApp(
  platform: Platform,
  options: Partial<InertiaModuleOptions>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [InertiaModule.forRoot({ version: 'v1', ...options })],
    controllers: [ProbeController],
  }).compile();
  if (platform === 'fastify') {
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe.each<Platform>(['express', 'fastify'])(
  'InertiaValidationFilter passthrough (%s)',
  (platform) => {
    describe('validation disabled (default)', () => {
      let app: INestApplication;
      beforeAll(async () => {
        app = await createApp(platform, {});
      });
      afterAll(async () => {
        await app.close();
      });

      it('non-Inertia 400 → normal JSON 400, no unhandled rejection', async () => {
        const res = await request(app.getHttpServer()).post('/api/thing').send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          message: 'Validation failed',
          issues: [{ path: ['email'], message: 'Required' }],
        });
      });

      it('Inertia 400 with validation disabled → normal JSON 400', async () => {
        const res = await request(app.getHttpServer()).post('/form').set('X-Inertia', 'true');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ __inertiaErrors: { email: 'required' } });
      });
    });

    describe('validation enabled', () => {
      let app: INestApplication;
      const write = vi.fn();
      beforeAll(async () => {
        const flashStore: FlashStore = { read: () => ({}), write };
        app = await createApp(platform, { flashStore, validation: { enabled: true } });
      });
      afterAll(async () => {
        await app.close();
      });
      beforeEach(() => {
        write.mockReset();
      });

      it('non-Inertia 400 → normal JSON 400 (no flash write)', async () => {
        const res = await request(app.getHttpServer()).post('/api/thing').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Validation failed');
        expect(write).not.toHaveBeenCalled();
      });

      it('Inertia non-validation 400 → normal JSON 400', async () => {
        const res = await request(app.getHttpServer()).post('/api/plain').set('X-Inertia', 'true');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          statusCode: 400,
          message: 'plain message',
          error: 'Bad Request',
        });
        expect(write).not.toHaveBeenCalled();
      });

      it('Inertia validation 400 → flash + 303 redirect back', async () => {
        const res = await request(app.getHttpServer())
          .post('/form')
          .set('X-Inertia', 'true')
          .set('Host', 'localhost')
          .set('Referer', 'http://localhost/signup')
          .redirects(0);
        expect(res.status).toBe(303);
        expect(res.headers.location).toBe('/signup');
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0]?.[1]).toEqual({ email: 'required' });
      });

      it('flashStore.write rejecting → 500 response, no unhandled rejection', async () => {
        write.mockRejectedValueOnce(new Error('session store down'));
        const res = await request(app.getHttpServer())
          .post('/form')
          .set('X-Inertia', 'true')
          .redirects(0);
        expect(res.status).toBe(500);
      });
    });
  },
);
