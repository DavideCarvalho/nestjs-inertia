import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export interface DiscoverRoutesOptions {
  /** Absolute path to the AppModule entry file (e.g. `src/app.module.ts`). */
  moduleEntry: string;
  /** Optional tsconfig path; defaults to the codegen package's tsconfig.probe.json. */
  tsconfig?: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Boots the user's NestJS AppModule in a child process and returns the route table.
 * The child process uses `tsx` (ESM loader) to handle TypeScript files.
 *
 * @deprecated since v0.10. The static AST path (default) covers all common cases.
 * Heavy probe will be removed in v1.0.
 */
export async function discoverRoutes(opts: DiscoverRoutesOptions): Promise<RouteDescriptor[]> {
  const { moduleEntry, tsconfig } = opts;

  // Resolve the probe script path relative to this file
  const req = createRequire(import.meta.url);
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const probeScript = resolve(thisDir, 'probe.ts');

  // Resolve tsx ESM loader
  const tsxEsmPath = req.resolve('tsx/esm');

  // Use the provided tsconfig or fall back to the probe-specific one
  const defaultTsconfig = resolve(thisDir, '..', '..', 'tsconfig.probe.json');
  const tsconfigPath = tsconfig ?? defaultTsconfig;

  return new Promise<RouteDescriptor[]>((resolve, reject) => {
    const child = fork(probeScript, [moduleEntry], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      execArgv: ['--import', tsxEsmPath],
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: tsconfigPath,
        NESTJS_INERTIA_CODEGEN_PROBE: '1',
      },
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Route discovery timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    let resolved = false;

    child.on('message', (msg: unknown) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      child.kill();

      const m = msg as { routes?: RouteDescriptor[]; error?: string };
      if (m.error) {
        reject(new Error(`Probe error: ${m.error}`));
      } else {
        resolve(m.routes ?? []);
      }
    });

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(new Error(`Failed to spawn probe: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Probe exited with code ${code}`));
      } else {
        reject(new Error('Probe exited without sending routes'));
      }
    });

    // Collect stderr for debugging
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on('exit', () => {
      if (stderrChunks.length > 0 && !resolved) {
        const stderr = Buffer.concat(stderrChunks).toString();
        reject(new Error(`Probe failed:\n${stderr}`));
      }
    });
  });
}
