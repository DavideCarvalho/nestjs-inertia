/**
 * Route discovery probe — runs in a child process via fork().
 * Receives the moduleEntry path as process.argv[2].
 * Boots the user's NestJS AppModule, scans route metadata, and sends { routes } via process.send().
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];

async function run(): Promise<void> {
  const moduleEntryPath = process.argv[2];
  if (!moduleEntryPath) {
    throw new Error('moduleEntry path is required as argv[2]');
  }

  const mod = await import(moduleEntryPath);
  // Support both named AppModule export and default export
  const AppModule =
    mod.AppModule ??
    mod.default ??
    (Object.values(mod).find((v) => typeof v === 'function') as any);

  if (!AppModule) {
    throw new Error(`Cannot find AppModule in ${moduleEntryPath}`);
  }

  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await app.init();

  const container = (app as any).container as any;
  const modules: Map<string, any> = container.getModules();
  const routes: RouteDescriptor[] = [];

  for (const [, moduleRef] of modules) {
    const controllers: Map<string, any> = moduleRef.controllers;
    for (const [, ctrl] of controllers) {
      const instance = ctrl.instance;
      if (!instance) continue;
      const ctrlClass = instance.constructor as any;
      const ctrlName: string = ctrlClass.name;
      const ctrlPath: string = Reflect.getMetadata(PATH_METADATA, ctrlClass) ?? '';

      const methodNames = Object.getOwnPropertyNames(ctrlClass.prototype) as string[];
      for (const methodName of methodNames) {
        if (methodName === 'constructor') continue;
        const fn = ctrlClass.prototype[methodName] as unknown;
        if (typeof fn !== 'function') continue;

        const methodPath: string | undefined = Reflect.getMetadata(PATH_METADATA, fn);
        const methodType: number | undefined = Reflect.getMetadata(METHOD_METADATA, fn);
        if (methodPath === undefined || methodType === undefined) continue;

        const method = HTTP_METHODS[methodType] ?? 'GET';
        const rawPath = [ctrlPath, methodPath].filter((p) => p !== '').join('/');
        const fullPath = `/${rawPath}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

        // Extract path params from the full path pattern
        const pathParams: RouteDescriptor['params'] = (fullPath.match(/:(\w+)/g) ?? []).map(
          (p) => ({ name: p.slice(1), source: 'path' as const }),
        );

        routes.push({
          method,
          path: fullPath,
          name: `${ctrlName}.${methodName}`,
          params: pathParams,
        });
      }
    }
  }

  // Send results to parent
  if (process.send) {
    process.send({ routes });
  } else {
    process.stdout.write(JSON.stringify({ routes }) + '\n');
  }

  await app.close();
  process.exit(0);
}

run().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (process.send) {
    process.send({ error: msg });
  } else {
    process.stderr.write(msg + '\n');
  }
  process.exit(1);
});
