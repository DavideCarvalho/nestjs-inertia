import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverRoutes } from '../../src/discovery/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('discoverRoutes', () => {
  it('lists controller routes with methods and params', async () => {
    const routes = await discoverRoutes({
      moduleEntry: resolve(__dirname, '../__fixtures__/app/app.module.ts'),
    });

    expect(routes).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/users',
        name: 'UsersController.list',
        params: [],
      }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/users/:id',
        name: 'UsersController.show',
        params: [{ name: 'id', source: 'path' }],
      }),
    );
  }, 20_000);
});
