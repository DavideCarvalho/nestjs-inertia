import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import type { Manifest } from '../asset/version.provider.js';
import { UnsupportedRootViewExtensionException } from '../errors/exceptions.js';
import type { ShellRenderCtx } from '../types.js';
import { processDirectives } from './directives.js';
import { markServerRendered } from './mark-server-rendered.js';
import { serializePageData } from './serialize-page.js';
import {
  SSR_BODY_SENTINEL,
  type ShellParts,
  type ShellRenderer,
  splitOnSentinel,
} from './shell.js';
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
  /**
   * Stand-ins for the page markup and SSR head in engine output. Alphanumeric so no
   * engine escapes them; the random nonce keeps rendered data from forging one.
   */
  private readonly enginePlaceholders = createPlaceholders();
  private adapterPromise: Promise<TemplateEngineAdapter> | null = null;
  private readonly absPath: string;
  private readonly ext: string;
  private readonly base: string | undefined;

  /**
   * @param rootViewPath the root view template (absolute, or relative to `process.cwd()`).
   * @param options.base the public URL prefix of the Vite build (`vite.base`), prepended to the
   *   asset URLs `@vite`/`@asset` emit. Default `'/'`.
   */
  constructor(rootViewPath: string, options: { base?: string | undefined } = {}) {
    this.base = options.base;
    const ext = extname(rootViewPath).toLowerCase();
    if (!PLAIN_HTML.has(ext) && !TEMPLATE_EXTENSIONS.has(ext)) {
      throw new UnsupportedRootViewExtensionException(ext);
    }
    this.ext = ext;
    this.absPath = isAbsolute(rootViewPath) ? rootViewPath : resolve(process.cwd(), rootViewPath);
  }

  async render(ctx: ShellRenderCtx): Promise<string> {
    const isDev = process.env.NODE_ENV !== 'production';
    if (this.cachedTemplate === null || isDev) {
      this.cachedTemplate = await readFile(this.absPath, 'utf8');
      if (isDev) this.engineRenderer = null; // re-compile on next render
    }

    const pageJson = serializePageData(ctx.page);
    const ssrHead = ctx.ssr?.head.join('\n') ?? '';
    const ssrBody = ctx.ssr?.body != null ? markServerRendered(ctx.ssr.body) : null;
    const manifest = ctx.manifest as Manifest | null;

    if (PLAIN_HTML.has(this.ext)) {
      return processDirectives(this.cachedTemplate, {
        pageJson,
        ssrHead,
        ssrBody,
        manifest,
        isDev,
        base: this.base,
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

    const inertiaHtml =
      ssrBody ??
      `<div id="app"></div>\n<script data-page="app" type="application/json">${pageJson}</script>`;
    const directiveCtx = { pageJson, ssrHead, ssrBody, manifest, isDev, base: this.base };
    const placeholders = this.enginePlaceholders;
    const locals: Record<string, unknown> = {
      page: ctx.page,
      inertia: placeholders.body,
      inertiaHead: placeholders.head,
      vite: (entry: string) => {
        if (!/^[\w\-./]+$/.test(entry)) throw new Error(`Invalid vite entry: ${entry}`);
        return processDirectives(`@vite('${entry}')`, directiveCtx);
      },
      viteRefresh: processDirectives('@viteRefresh', directiveCtx),
      asset: (p: string) => {
        if (!/^[\w\-./]+$/.test(p)) throw new Error(`Invalid asset path: ${p}`);
        return processDirectives(`@asset('${p}')`, directiveCtx);
      },
    };

    // Directives anywhere in the engine output (root view, partials, includes) expand
    // to placeholders; the page markup and SSR head are substituted last, so page data
    // and SSR markup are never scanned for directives.
    const output = await this.engineRenderer(locals);
    const expanded = processDirectives(output, {
      ...directiveCtx,
      ssrHead: placeholders.head,
      ssrBody: placeholders.body,
    });
    return expanded.replace(placeholders.pattern, (match) =>
      match === placeholders.head ? ssrHead : inertiaHtml,
    );
  }

  /**
   * Streaming seam: render the shell with the SSR body replaced by a sentinel,
   * then split into head/tail so the head can be flushed before the app body has
   * finished rendering. Reuses the normal {@link render} path so directives,
   * template engines, and @inertiaHead all behave identically.
   */
  async renderToParts(ctx: ShellRenderCtx): Promise<ShellParts> {
    const full = await this.render({
      ...ctx,
      ssr: { head: ctx.ssr?.head ?? [], body: SSR_BODY_SENTINEL },
    });
    return splitOnSentinel(full);
  }
}

function createPlaceholders(): { head: string; body: string; pattern: RegExp } {
  const nonce = randomBytes(8).toString('hex');
  const head = `nestjsinertia${nonce}head`;
  const body = `nestjsinertia${nonce}body`;
  return { head, body, pattern: new RegExp(`${head}|${body}`, 'g') };
}
