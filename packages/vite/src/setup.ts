import { resolve } from 'node:path';

export interface SetupInertiaViteOptions {
  mode: string | undefined;
  root: string;
  publicDir: string;
  outDir: string;
  hmrPort?: number;
  configFile?: string;
}

type NestApp = {
  use: (pathOrMiddleware: unknown, middleware?: unknown) => void;
};

export async function setupInertiaVite(app: NestApp, options: SetupInertiaViteOptions): Promise<void> {
  if (options.mode !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: options.configFile ?? resolve(process.cwd(), 'vite.config.ts'),
      root: options.root,
      server: {
        middlewareMode: true,
        hmr: { port: options.hmrPort ?? 24679 },
      },
      appType: 'custom',
    });
    app.use((vite as { middlewares: unknown }).middlewares);
    return;
  }

  // Production: serve dist/<outDir>/client
  const express = await import('express');
  const clientDir = resolve(process.cwd(), options.outDir, 'client');
  app.use(
    '/assets',
    (express.default ?? express).static(resolve(clientDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }),
  );
  app.use(
    (express.default ?? express).static(clientDir, {
      maxAge: '1h',
      index: false,
      fallthrough: true,
    }),
  );
}
