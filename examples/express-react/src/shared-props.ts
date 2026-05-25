import type { Request } from 'express';

export function getSharedProps(_req: Request) {
  return {
    appName: 'nestjs-inertia-example',
    year: new Date().getFullYear(),
  };
}
