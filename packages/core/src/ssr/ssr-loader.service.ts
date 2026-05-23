import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { INERTIA_MODULE_OPTIONS } from '../tokens.js';
import type { InertiaModuleOptions, PageObject } from '../types.js';

export interface SsrModule {
  render(page: PageObject): Promise<{ head: string[]; body: string }>;
}

@Injectable()
export class SsrLoaderService {
  private readonly logger = new Logger(SsrLoaderService.name);
  private cached: SsrModule | null = null;
  private failed = false;

  constructor(@Inject(INERTIA_MODULE_OPTIONS) private readonly opts: InertiaModuleOptions) {}

  async load(): Promise<SsrModule | null> {
    if (!this.opts.ssr?.enabled) return null;
    if (this.cached) return this.cached;
    if (this.failed) return null;
    try {
      const bundlePath = resolve(
        process.cwd(),
        this.opts.ssr.bundlePath ?? 'dist/inertia/ssr/ssr.mjs',
      );
      // vitest 3's vite-node intercepts `await import(filePath)` even with
      // @vite-ignore, masking real fs errors with "Cannot find module imported
      // from <source>". Read the bundle off disk and import via a data: URL —
      // the module is inlined so the resolver has nothing to look up.
      // The bundle is loaded once then cached on `this.cached`, so the readFile
      // cost is one-shot.
      const code = readFileSync(bundlePath, 'utf8');
      const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
      const mod = (await import(/* @vite-ignore */ dataUrl)) as {
        default?: SsrModule;
        render?: SsrModule['render'];
      };
      // Bundle may export default or named `render`
      if (mod.default && typeof mod.default.render === 'function') {
        this.cached = mod.default;
      } else if (typeof mod.render === 'function') {
        this.cached = { render: mod.render };
      } else {
        if (this.opts.ssr.throwOnError)
          throw new Error('SSR bundle exports neither default nor render()');
        this.failed = true;
        this.logger.warn('SSR bundle missing required exports; falling back to CSR.');
        return null;
      }
      return this.cached;
    } catch (err) {
      this.failed = true;
      if (this.opts.ssr.throwOnError) throw err;
      this.logger.warn(`SSR bundle not loaded, falling back to CSR: ${(err as Error).message}`);
      return null;
    }
  }
}
