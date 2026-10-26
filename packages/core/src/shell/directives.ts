import { randomBytes } from 'node:crypto';
import type { Manifest } from '../asset/version.provider.js';

export interface DirectiveContext {
  pageJson: string;
  ssrHead: string;
  ssrBody: string | null;
  manifest: Manifest | null;
  isDev: boolean;
  /**
   * Public URL prefix of the Vite build (Vite's `base`, the module's `vite.base`), prepended to
   * every emitted asset URL. Default `'/'`.
   */
  base?: string | undefined;
}

/**
 * Normalizes a Vite `base` to a prefix ending in `/`: `'m'`/`'/m'`/`'/m/'` → `'/m/'`, a full URL
 * (`https://cdn…/m`) keeps its origin, and an empty/absent base is `'/'`.
 */
export function normalizeAssetBase(base: string | undefined): string {
  if (!base || base === '/') return '/';
  const withTrailing = base.endsWith('/') ? base : `${base}/`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withTrailing) || withTrailing.startsWith('//')) {
    return withTrailing;
  }
  return withTrailing.startsWith('/') ? withTrailing : `/${withTrailing}`;
}

const viteRefreshPreamble = (base: string) => `<script type="module">
import RefreshRuntime from "${base}@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`;

/**
 * Every directive, in one alternation so the template is scanned in a single pass and
 * substituted output (page JSON, SSR head/body, asset tags) is never scanned again.
 * `@inertiaHead` precedes `@inertia` so the latter never consumes the former.
 */
const DIRECTIVE_RE =
  /@inertiaHead\b|@inertia(?![a-zA-Z(])|@viteRefresh\b|@vite\(\s*['"]([^'"]+)['"]\s*\)|@asset\(\s*['"]([^'"]+)['"]\s*\)/g;

export function processDirectives(template: string, ctx: DirectiveContext): string {
  const base = normalizeAssetBase(ctx.base);
  return template.replace(
    DIRECTIVE_RE,
    (full: string, viteEntry: string | undefined, assetPath: string | undefined) => {
      if (viteEntry !== undefined) return renderVite(viteEntry, ctx, base);
      if (assetPath !== undefined) return renderAsset(assetPath, ctx, base);
      if (full === '@inertiaHead') return ctx.ssrHead;
      if (full === '@viteRefresh') return ctx.isDev ? viteRefreshPreamble(base) : '';
      if (ctx.ssrBody) return ctx.ssrBody;
      return `<div id="app"></div>\n<script data-page="app" type="application/json">${ctx.pageJson}</script>`;
    },
  );
}

/** `@vite('entry')` — in dev: HMR client + React Refresh preamble + entry script. */
function renderVite(entry: string, ctx: DirectiveContext, base: string): string {
  if (ctx.isDev) {
    return [
      `<script type="module" src="${base}@vite/client"></script>`,
      viteRefreshPreamble(base),
      `<script type="module" src="${base}${entry}"></script>`,
    ].join('\n');
  }
  const entryRecord = ctx.manifest?.[entry];
  if (!entryRecord) {
    throw new Error(`[nestjs-inertia] manifest entry not found for "${entry}"`);
  }
  const scriptTag = `<script type="module" src="${base}${entryRecord.file}"></script>`;
  const cssTags = (entryRecord.css ?? [])
    .map((href) => `<link rel="stylesheet" href="${base}${href}" />`)
    .join('\n');
  return [scriptTag, cssTags].filter(Boolean).join('\n');
}

/** `@asset('path')` — the hashed build file in production, the source path in dev. */
function renderAsset(path: string, ctx: DirectiveContext, base: string): string {
  if (ctx.isDev) return `${base}${path}`;
  const entry = ctx.manifest?.[path];
  return entry ? `${base}${entry.file}` : `${base}${path}`;
}

/**
 * A template-engine source with its directives swapped for opaque placeholders, so the
 * engine renders around them and {@link DirectiveTemplate.restore} substitutes them
 * afterwards. Only the placeholders are replaced: text the engine interpolated (page
 * props, SSR markup) is never parsed for directives.
 */
export interface DirectiveTemplate {
  source: string;
  restore(output: string, ctx: DirectiveContext): string;
}

export function extractDirectives(template: string): DirectiveTemplate {
  const directives: string[] = [];
  // Alphanumeric so no engine escapes it; the random nonce keeps rendered data from forging one.
  const nonce = randomBytes(8).toString('hex');
  const source = template.replace(DIRECTIVE_RE, (full: string) => {
    directives.push(full);
    return `nestjsinertia${nonce}d${directives.length - 1}x`;
  });
  if (directives.length === 0) return { source, restore: (output) => output };
  const placeholder = new RegExp(`nestjsinertia${nonce}d(\\d+)x`, 'g');
  return {
    source,
    restore: (output, ctx) =>
      output.replace(placeholder, (_full, index: string) =>
        processDirectives(directives[Number(index)] as string, ctx),
      ),
  };
}
