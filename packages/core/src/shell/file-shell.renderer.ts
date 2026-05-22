import { readFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import type { Manifest } from '../asset/version.provider.js';
import { UnsupportedRootViewExtensionException } from '../errors/exceptions.js';
import type { ShellRenderCtx } from '../types.js';
import { processDirectives } from './directives.js';
import { serializePageData } from './serialize-page.js';
import type { ShellRenderer } from './shell.js';
import type { TemplateEngineAdapter } from './template-engine.adapter.js';
import { resolveTemplateEngine } from './template-engine.registry.js';

const PLAIN_HTML = new Set(['.html', '.htm']);
const TEMPLATE_EXTENSIONS = new Set([
  '.hbs',
  '.handlebars',
  '.ejs',
  '.pug',
  '.liquid',
  '.liquidjs',
]);

export class FileBasedShellRenderer implements ShellRenderer {
  private cachedTemplate: string | null = null;
  private engineRenderer: ((locals: Record<string, unknown>) => string | Promise<string>) | null =
    null;
  private adapterPromise: Promise<TemplateEngineAdapter> | null = null;
  private readonly absPath: string;
  private readonly ext: string;

  constructor(rootViewPath: string) {
    const ext = extname(rootViewPath).toLowerCase();
    if (!PLAIN_HTML.has(ext) && !TEMPLATE_EXTENSIONS.has(ext)) {
      throw new UnsupportedRootViewExtensionException(ext);
    }
    this.ext = ext;
    this.absPath = isAbsolute(rootViewPath) ? rootViewPath : resolve(process.cwd(), rootViewPath);
  }

  async render(ctx: ShellRenderCtx): Promise<string> {
    if (this.cachedTemplate === null) {
      this.cachedTemplate = readFileSync(this.absPath, 'utf8');
    }

    const pageJson = serializePageData(ctx.page);
    const ssrHead = ctx.ssr?.head.join('\n') ?? '';
    const ssrBody = ctx.ssr?.body ?? null;
    const isDev = process.env.NODE_ENV !== 'production';
    const manifest = ctx.manifest as Manifest | null;

    if (PLAIN_HTML.has(this.ext)) {
      return processDirectives(this.cachedTemplate, {
        pageJson,
        ssrHead,
        ssrBody,
        manifest,
        isDev,
      });
    }

    // Template engine path
    if (this.adapterPromise === null) {
      this.adapterPromise = resolveTemplateEngine(this.ext);
    }
    if (this.engineRenderer === null) {
      const adapter = await this.adapterPromise;
      this.engineRenderer = adapter.compile(this.cachedTemplate, this.absPath);
    }

    const inertiaHtml = ssrBody ?? `<div id="app"></div>\n<script id="inertia-page" type="application/json">${pageJson}</script>`;
    const directiveCtx = { pageJson, ssrHead, ssrBody, manifest, isDev };
    const locals: Record<string, unknown> = {
      page: ctx.page,
      inertia: inertiaHtml,
      inertiaHead: ssrHead,
      vite: (entry: string) => processDirectives(`@vite('${entry}')`, directiveCtx),
      viteRefresh: processDirectives('@viteRefresh', directiveCtx),
      asset: (p: string) => processDirectives(`@asset('${p}')`, directiveCtx),
    };

    let output = await this.engineRenderer(locals);
    // Run directive parser on output too — supports devs who mix template syntax with @inertia
    output = processDirectives(output, directiveCtx);
    return output;
  }
}
