import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InertiaNotFoundFilter } from '../src/filter/not-found.filter.js';

function makeHost(req: unknown, res: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as never;
}

describe('InertiaNotFoundFilter', () => {
  it('returns JSON 404 for /api/* paths', async () => {
    const filter = new InertiaNotFoundFilter({ apiPrefix: '/api', component: 'NotFound' });
    const req = { originalUrl: '/api/v1/missing', url: '/api/v1/missing' };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, headersSent: false };
    await filter.catch(new NotFoundException('Not found'), makeHost(req, res));
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      path: '/api/v1/missing',
      errorCode: 'NOT_FOUND',
    }));
  });

  it('renders Inertia NotFound component for non-API paths', async () => {
    const filter = new InertiaNotFoundFilter({ apiPrefix: '/api', component: 'NotFound' });
    const render = vi.fn().mockResolvedValue(undefined);
    const req = { originalUrl: '/missing-page', url: '/missing-page', inertia: { render } };
    const status = vi.fn();
    const res = { status, headersSent: false };
    await filter.catch(new NotFoundException(), makeHost(req, res));
    expect(status).toHaveBeenCalledWith(404);
    expect(render).toHaveBeenCalledWith('NotFound', { requestedPath: '/missing-page' });
  });

  it('falls back to JSON when req.inertia is missing', async () => {
    const filter = new InertiaNotFoundFilter({ apiPrefix: '/api', component: 'NotFound' });
    const req = { originalUrl: '/page', url: '/page' };
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, headersSent: false };
    await filter.catch(new NotFoundException(), makeHost(req, res));
    expect(json).toHaveBeenCalled();
  });
});
