import { readFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { escapeHtml } from '../helpers/escape-html.js';
import { processDirectives } from './directives.js';
import { UnsupportedRootViewExtensionException } from '../errors/exceptions.js';
import type { ShellRenderCtx } from '../types.js';
import type { ShellRenderer } from './shell.js';
import type { Manifest } from '../asset/version.provider.js';

const SUPPORTED_EXTENSIONS = new Set(['.html', '.htm']);

export class FileBasedShellRenderer implements ShellRenderer {
  private cachedTemplate: string | null = null;
  private readonly absPath: string;

  constructor(rootViewPath: string) {
    const ext = extname(rootViewPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new UnsupportedRootViewExtensionException(ext);
    }
    this.absPath = isAbsolute(rootViewPath) ? rootViewPath : resolve(process.cwd(), rootViewPath);
  }

  async render(ctx: ShellRenderCtx): Promise<string> {
    if (this.cachedTemplate === null) {
      this.cachedTemplate = readFileSync(this.absPath, 'utf8');
    }
    const pageJson = escapeHtml(JSON.stringify(ctx.page));
    const ssrHead = ctx.ssr?.head.join('\n') ?? '';
    const ssrBody = ctx.ssr?.body ?? null;
    return processDirectives(this.cachedTemplate, {
      pageJson,
      ssrHead,
      ssrBody,
      manifest: ctx.manifest as Manifest | null,
      isDev: process.env.NODE_ENV !== 'production',
    });
  }
}
