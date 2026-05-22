/**
 * Route discovery probe — runs in a child process via fork().
 * Receives the moduleEntry path as process.argv[2].
 * Boots the user's NestJS AppModule, scans route metadata, and sends { routes } via process.send().
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';

export interface ContractSource {
  query: string | null;
  body: string | null;
  response: string;
}

export interface ContractDescriptor {
  name: string | undefined;
  method: string;
  path: string;
  contractSource: ContractSource;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
  contract?: ContractDescriptor;
}

/**
 * Inline Zod-to-TypeScript walker.
 * Serializes a Zod schema to a TypeScript type expression string.
 * Inlined here so the probe (child process) doesn't need an extra import at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToTs(schema: any): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const t: string = schema?._def?.typeName ?? '';
  switch (t) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodLiteral':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return JSON.stringify(schema._def.value) as string;
    case 'ZodEnum':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return (schema._def.values as string[]).map((v: string) => JSON.stringify(v)).join(' | ');
    case 'ZodArray':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `Array<${zodToTs(schema._def.type)}>`;
    case 'ZodOptional':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `${zodToTs(schema._def.innerType)} | undefined`;
    case 'ZodNullable':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `${zodToTs(schema._def.innerType)} | null`;
    case 'ZodUnion':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return (schema._def.options as any[]).map(zodToTs).join(' | ');
    case 'ZodObject': {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const shape: Record<string, any> = schema._def.shape();
      const lines = Object.keys(shape).map((k) => {
        const v = shape[k];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const opt = v?._def?.typeName === 'ZodOptional' ? '?' : '';
        return `${k}${opt}: ${zodToTs(v)}`;
      });
      return `{ ${lines.join('; ')} }`;
    }
    case 'ZodRecord':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `Record<string, ${zodToTs(schema._def.valueType)}>`;
    case 'ZodTuple':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return `[${(schema._def.items as any[]).map(zodToTs).join(', ')}]`;
    case 'ZodUnknown':
    case 'ZodAny':
      return 'unknown';
    default:
      return 'unknown';
  }
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];
const CONTRACT_METADATA_KEY = Symbol.for('nestjs-inertia:contract');

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

        const descriptor: RouteDescriptor = {
          method,
          path: fullPath,
          name: `${ctrlName}.${methodName}`,
          params: pathParams,
        };

        // Collect @ApplyContract metadata if present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contract: any = Reflect.getMetadata(CONTRACT_METADATA_KEY, fn);
        if (contract) {
          descriptor.contract = {
            name: contract.name as string | undefined,
            method: contract.method as string,
            path: contract.path as string,
            contractSource: {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              query: contract.query ? zodToTs(contract.query) : null,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              body: contract.body ? zodToTs(contract.body) : null,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              response: contract.response ? zodToTs(contract.response) : 'unknown',
            },
          };
        }

        routes.push(descriptor);
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
